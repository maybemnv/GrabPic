import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContext } from '../index'
import { cleanupEventResources } from '../lib/event-cleanup'
import {
  generateOrganizerToken,
  hashOrganizerToken,
  verifyOrganizerToken,
} from '../lib/organizer-auth'
import { insertEventWithUniquePasscode } from '../lib/passcodes'
import { rateLimitKey } from '../lib/rate-limit'

const app = new Hono<AppContext>()

const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  organizerEmail: z.string().email(),
  organizerName: z.string().min(1).max(100),
  expiryDays: z.number().int().min(1).max(90).default(30),
})

const lookupEventSchema = z.object({ passcode: z.string().regex(/^\d{6}$/) })

function generateId(prefix: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `${prefix}_${result}`
}

app.post('/', async (c) => {
  const log = c.get('logger')
  const sentry = c.get('sentry')
  try {
    const clientId =
      c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
    const limit = await c.env.RATE_LIMITER.limit({
      key: rateLimitKey('create-event', '', clientId),
    })
    if (!limit.success) {
      return c.json({ error: 'Too many event creation requests', code: 'RATE_LIMITED' }, 429)
    }

    const body = await c.req.json()
    const parsed = createEventSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, 400)
    }

    const { name, organizerEmail, organizerName, expiryDays } = parsed.data
    const eventId = generateId('evt')
    const organizerToken = generateOrganizerToken()
    const organizerTokenHash = await hashOrganizerToken(organizerToken)
    const inviteToken = crypto.randomUUID().replaceAll('-', '')
    const now = Math.floor(Date.now() / 1000)

    const db = (await import('@libsql/client')).createClient({
      url: c.env.TURSO_URL,
      authToken: c.env.TURSO_TOKEN,
    })

    const passcode = await insertEventWithUniquePasscode(async (candidate) => {
      await db.execute({
        sql: `INSERT INTO events (id, name, passcode, invite_token, organizer_token_hash, created_at, expires_at, status, organizer_email, organizer_name)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?)`,
        args: [
          eventId,
          name,
          candidate,
          inviteToken,
          organizerTokenHash,
          now,
          now + expiryDays * 86400,
          organizerEmail,
          organizerName,
        ],
      })
    })

    log.info('event: created', { eventId, name, organizerEmail })

    return c.json(
      {
        eventId,
        passcode,
        organizerToken,
        uploadUrl: `/events/${eventId}/upload`,
        shareUrl: `https://grabpic.app/e/${inviteToken}`,
        qrCode: `https://api.grabpic.app/qr/${eventId}`,
        expiresAt: now + expiryDays * 86400,
      },
      201,
    )
  } catch (err) {
    log.error('event: create error', { error: String(err) })
    sentry.captureException(err, { route: 'createEvent' })
    return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})

app.post('/lookup', async (c) => {
  const clientId = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
  const limit = await c.env.RATE_LIMITER.limit({ key: rateLimitKey('event-lookup', '', clientId) })
  if (!limit.success) {
    return c.json({ error: 'Too many event lookup requests', code: 'RATE_LIMITED' }, 429)
  }

  const parsed = lookupEventSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, 400)
  }

  const db = (await import('@libsql/client')).createClient({
    url: c.env.TURSO_URL,
    authToken: c.env.TURSO_TOKEN,
  })
  const result = await db.execute({
    sql: 'SELECT id, name, status FROM events WHERE passcode = ?',
    args: [parsed.data.passcode],
  })
  if (result.rows.length === 0) {
    return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
  }

  const row = result.rows[0] as Record<string, unknown>
  return c.json({ eventId: String(row.id), name: String(row.name), status: String(row.status) })
})

app.get('/invite/:inviteToken', async (c) => {
  const inviteToken = c.req.param('inviteToken')
  const db = (await import('@libsql/client')).createClient({
    url: c.env.TURSO_URL,
    authToken: c.env.TURSO_TOKEN,
  })
  const result = await db.execute({
    sql: 'SELECT id, name, status FROM events WHERE invite_token = ?',
    args: [inviteToken],
  })
  if (result.rows.length === 0) {
    return c.json({ error: 'Invite not found', code: 'NOT_FOUND' }, 404)
  }

  const row = result.rows[0] as Record<string, unknown>
  return c.json({ eventId: String(row.id), name: String(row.name), status: String(row.status) })
})

app.get('/:eventId', async (c) => {
  const eventId = c.req.param('eventId')
  const log = c.get('logger')

  const db = (await import('@libsql/client')).createClient({
    url: c.env.TURSO_URL,
    authToken: c.env.TURSO_TOKEN,
  })

  const result = await db.execute({
    sql: 'SELECT * FROM events WHERE id = ?',
    args: [eventId],
  })

  if (result.rows.length === 0) {
    log.warn('event: not found', { eventId })
    return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
  }

  const eventRow = result.rows[0] as Record<string, unknown>
  if (!(await verifyOrganizerToken(c.req.header('authorization'), eventRow.organizer_token_hash))) {
    return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
  }

  const { organizer_token_hash: _organizerTokenHash, ...eventData } = eventRow
  return c.json(eventData)
})

app.get('/:eventId/status', async (c) => {
  const eventId = c.req.param('eventId')
  const log = c.get('logger')

  const db = (await import('@libsql/client')).createClient({
    url: c.env.TURSO_URL,
    authToken: c.env.TURSO_TOKEN,
  })

  const result = await db.execute({
    sql: 'SELECT status, photo_count, face_count, organizer_token_hash FROM events WHERE id = ?',
    args: [eventId],
  })

  if (result.rows.length === 0) {
    log.warn('event: status not found', { eventId })
    return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
  }

  const row = result.rows[0] as Record<string, unknown>
  if (!(await verifyOrganizerToken(c.req.header('authorization'), row.organizer_token_hash))) {
    return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
  }
  const faceCount = Number(row.face_count) || 0
  const photoCount = Number(row.photo_count) || 0
  const status = String(row.status)

  return c.json({
    status,
    photoCount,
    faceCount,
    progress: status === 'ready' ? 100 : status === 'processing' ? 50 : 0,
    error: null,
  })
})

app.delete('/:eventId', async (c) => {
  const eventId = c.req.param('eventId')
  const log = c.get('logger')
  const sentry = c.get('sentry')

  const db = (await import('@libsql/client')).createClient({
    url: c.env.TURSO_URL,
    authToken: c.env.TURSO_TOKEN,
  })

  const eventResult = await db.execute({
    sql: 'SELECT id, organizer_token_hash FROM events WHERE id = ?',
    args: [eventId],
  })
  if (eventResult.rows.length === 0) {
    return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
  }
  const eventRow = eventResult.rows[0] as Record<string, unknown>
  if (!(await verifyOrganizerToken(c.req.header('authorization'), eventRow.organizer_token_hash))) {
    return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
  }

  const result = await cleanupEventResources({
    db,
    bucket: c.env.PHOTOS,
    eventId,
    log,
    sentry,
  })

  if (!result) {
    log.warn('event: delete not found', { eventId })
    return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
  }

  if (!result.deleted) {
    return c.json({ error: 'Failed to delete event assets', code: 'ASSET_DELETE_FAILED' }, 500)
  }

  log.info('event: deleted', { eventId, photosDeleted: result.photosDeleted })
  sentry.captureMessage('Event deleted', { eventId, photosDeleted: result.photosDeleted })

  return c.json({
    deleted: true,
    photosDeleted: result.photosDeleted,
    storageFreed: result.storageFreed,
  })
})

export { app as events }
