import { Hono } from 'hono'
import { z } from 'zod'
import { api } from '../../convex/_generated/api'
import type { AppContext } from '../index'
import { cleanupEventResources } from '../lib/event-cleanup'
import { createConvexClient, hasConvexError } from '../lib/convex'
import { resolveMatchThreshold } from '../lib/matching'
import {
  generateOrganizerToken,
  hashOrganizerAuthorization,
  hashOrganizerToken,
} from '../lib/organizer-auth'
import { requestProcessingCancellation } from '../lib/modal'
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

    const convex = createConvexClient(c.env)

    const passcode = await insertEventWithUniquePasscode(async (candidate) => {
      await convex.mutation(api.events.create, {
        serviceSecret: c.env.CONVEX_SERVICE_SECRET,
        publicId: eventId,
        name,
        passcode: candidate,
        inviteToken,
        organizerTokenHash,
        createdAt: now,
        expiresAt: now + expiryDays * 86400,
        organizerEmail,
        organizerName,
        maxPhotos: 100,
        tier: 'free',
        matchThreshold: resolveMatchThreshold(c.env.MATCH_THRESHOLD),
        clusteringEps: 0.4,
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

  const event = await createConvexClient(c.env).query(api.events.lookupByPasscode, {
    serviceSecret: c.env.CONVEX_SERVICE_SECRET,
    passcode: parsed.data.passcode,
    now: Math.floor(Date.now() / 1000),
  })
  if (!event) {
    return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
  }

  return c.json(event)
})

app.get('/invite/:inviteToken', async (c) => {
  const inviteToken = c.req.param('inviteToken')
  const event = await createConvexClient(c.env).query(api.events.lookupByInvite, {
    serviceSecret: c.env.CONVEX_SERVICE_SECRET,
    inviteToken,
    now: Math.floor(Date.now() / 1000),
  })
  if (!event) {
    return c.json({ error: 'Invite not found', code: 'NOT_FOUND' }, 404)
  }

  return c.json(event)
})

app.get('/:eventId', async (c) => {
  const eventId = c.req.param('eventId')
  const log = c.get('logger')
  const organizerTokenHash = await hashOrganizerAuthorization(c.req.header('authorization'))
  if (!organizerTokenHash) {
    return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
  }

  try {
    const event = await createConvexClient(c.env).query(api.events.getOrganizerEvent, {
      serviceSecret: c.env.CONVEX_SERVICE_SECRET,
      publicId: eventId,
      organizerTokenHash,
    })
    if (!event) {
      log.warn('event: not found', { eventId })
      return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
    }

    return c.json({
      id: event.publicId,
      name: event.name,
      passcode: event.passcode,
      invite_token: event.inviteToken,
      created_at: event.createdAt,
      expires_at: event.expiresAt,
      status: event.status,
      photo_count: event.photoCount,
      face_count: event.faceCount,
      organizer_email: event.organizerEmail,
      organizer_name: event.organizerName,
      max_photos: event.maxPhotos,
      tier: event.tier,
    })
  } catch (error) {
    if (hasConvexError(error, 'UNAUTHORIZED')) {
      return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
    }
    throw error
  }
})

app.get('/:eventId/status', async (c) => {
  const eventId = c.req.param('eventId')
  const log = c.get('logger')
  const organizerTokenHash = await hashOrganizerAuthorization(c.req.header('authorization'))
  if (!organizerTokenHash) {
    return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
  }

  try {
    const event = await createConvexClient(c.env).query(api.events.getStatus, {
      serviceSecret: c.env.CONVEX_SERVICE_SECRET,
      publicId: eventId,
      organizerTokenHash,
    })
    if (!event) {
      log.warn('event: status not found', { eventId })
      return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
    }

    return c.json({
      ...event,
      progress: event.status === 'ready' ? 100 : event.status === 'processing' ? 50 : 0,
    })
  } catch (error) {
    if (hasConvexError(error, 'UNAUTHORIZED')) {
      return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
    }
    throw error
  }
})

app.delete('/:eventId', async (c) => {
  const eventId = c.req.param('eventId')
  const log = c.get('logger')
  const sentry = c.get('sentry')
  const organizerTokenHash = await hashOrganizerAuthorization(c.req.header('authorization'))
  if (!organizerTokenHash) {
    return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
  }

  try {
    const convex = createConvexClient(c.env)
    await convex.mutation(api.deletion.beginOrganizer, {
      serviceSecret: c.env.CONVEX_SERVICE_SECRET,
      eventPublicId: eventId,
      organizerTokenHash,
      now: Math.floor(Date.now() / 1000),
    })
    const result = await cleanupEventResources({
      client: convex,
      serviceSecret: c.env.CONVEX_SERVICE_SECRET,
      bucket: c.env.PHOTOS,
      eventId,
      cancelModalJob: (modalJobId) =>
        requestProcessingCancellation(c.env.MODAL_CANCEL_URL, c.env.MODAL_TOKEN, modalJobId),
      log,
      sentry,
    })
    if (!result) return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
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
  } catch (error) {
    if (hasConvexError(error, 'EVENT_NOT_FOUND')) {
      return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
    }
    if (hasConvexError(error, 'UNAUTHORIZED')) {
      return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
    }
    throw error
  }
})

export { app as events }
