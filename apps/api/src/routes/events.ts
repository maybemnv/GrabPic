import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContext } from '../index'
import { cleanupEventResources } from '../lib/event-cleanup'

const app = new Hono<AppContext>()

const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  organizerEmail: z.string().email(),
  organizerName: z.string().min(1).max(100),
  expiryDays: z.number().int().min(1).max(90).default(30),
})

function generatePasscode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

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
    const body = await c.req.json()
    const parsed = createEventSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, 400)
    }

    const { name, organizerEmail, organizerName, expiryDays } = parsed.data
    const eventId = generateId('evt')
    const passcode = generatePasscode()
    const now = Math.floor(Date.now() / 1000)

    const db = (await import('@libsql/client')).createClient({
      url: c.env.TURSO_URL,
      authToken: c.env.TURSO_TOKEN,
    })

    await db.execute({
      sql: `INSERT INTO events (id, name, passcode, created_at, expires_at, status, organizer_email, organizer_name)
            VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)`,
      args: [eventId, name, passcode, now, now + expiryDays * 86400, organizerEmail, organizerName],
    })

    log.info('event: created', { eventId, name, organizerEmail })

    return c.json(
      {
        eventId,
        passcode,
        uploadUrl: `/events/${eventId}/upload`,
        shareUrl: `https://grabpic.app/e/${passcode}`,
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

  return c.json(result.rows[0])
})

app.get('/:eventId/status', async (c) => {
  const eventId = c.req.param('eventId')
  const log = c.get('logger')

  const db = (await import('@libsql/client')).createClient({
    url: c.env.TURSO_URL,
    authToken: c.env.TURSO_TOKEN,
  })

  const result = await db.execute({
    sql: 'SELECT status, photo_count, face_count FROM events WHERE id = ?',
    args: [eventId],
  })

  if (result.rows.length === 0) {
    log.warn('event: status not found', { eventId })
    return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
  }

  const row = result.rows[0] as Record<string, unknown>
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
