import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContext } from '../index'
import { findMatches, resolveMatchThreshold } from '../lib/matching'
import { requestSelfieEmbedding } from '../lib/modal'
import { globalRateLimitKey } from '../lib/rate-limit'
import { createSignedR2Url } from '../lib/r2'

const app = new Hono<AppContext>()

const matchSchema = z
  .object({
    passcode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    inviteToken: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
    selfieData: z
      .string()
      .min(32)
      .max(15 * 1024 * 1024)
      .startsWith('data:image/'),
  })
  .refine((value) => value.passcode || value.inviteToken, {
    message: 'passcode or inviteToken is required',
  })

function parseBbox(value: unknown): { x: number; y: number; width: number; height: number } | null {
  let bbox = value
  if (typeof bbox === 'string') {
    try {
      bbox = JSON.parse(bbox)
    } catch {
      return null
    }
  }

  if (Array.isArray(bbox) && bbox.length === 4 && bbox.every((item) => typeof item === 'number')) {
    const [x1, y1, x2, y2] = bbox
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
  }

  if (
    bbox &&
    typeof bbox === 'object' &&
    ['x', 'y', 'width', 'height'].every(
      (key) => typeof (bbox as Record<string, unknown>)[key] === 'number',
    )
  ) {
    return bbox as { x: number; y: number; width: number; height: number }
  }

  return null
}

app.post('/', async (c) => {
  const eventId = c.req.param('eventId')
  const log = c.get('logger')
  const sentry = c.get('sentry')
  const clientId = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
  const startTime = Date.now()

  if (!eventId) {
    return c.json({ error: 'Event ID required', code: 'VALIDATION_ERROR' }, 400)
  }

  try {
    const limit = await c.env.RATE_LIMITER.limit({ key: globalRateLimitKey('match', clientId) })
    if (!limit.success) {
      return c.json({ error: 'Too many match requests', code: 'RATE_LIMITED' }, 429)
    }

    const parsed = matchSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, 400)
    }

    const { selfieData } = parsed.data
    const threshold = resolveMatchThreshold(c.env.MATCH_THRESHOLD)
    const db = (await import('@libsql/client')).createClient({
      url: c.env.TURSO_URL,
      authToken: c.env.TURSO_TOKEN,
    })

    const event = await db.execute({
      sql: 'SELECT id, passcode, invite_token, status FROM events WHERE id = ?',
      args: [eventId],
    })

    if (event.rows.length === 0) {
      log.warn('match: event not found', { eventId })
      return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
    }

    const eventRow = event.rows[0] as Record<string, unknown>
    const authorizedByPasscode =
      parsed.data.passcode && String(eventRow.passcode) === parsed.data.passcode
    const authorizedByInvite =
      parsed.data.inviteToken && String(eventRow.invite_token) === parsed.data.inviteToken
    if (!authorizedByPasscode && !authorizedByInvite) {
      log.warn('match: invalid passcode', { eventId })
      return c.json({ error: 'Invalid passcode', code: 'UNAUTHORIZED' }, 401)
    }

    if (String(eventRow.status) !== 'ready') {
      log.info('match: event not ready', { eventId, status: eventRow.status })
      return c.json({ error: 'Event still processing', code: 'NOT_READY' }, 400)
    }

    if (!c.env.MODAL_EMBEDDING_URL || !c.env.MODAL_TOKEN) {
      return c.json({ error: 'Matching service unavailable', code: 'MATCHING_UNAVAILABLE' }, 503)
    }

    let selfieEmbedding: Float32Array
    try {
      selfieEmbedding = await requestSelfieEmbedding(
        c.env.MODAL_EMBEDDING_URL,
        c.env.MODAL_TOKEN,
        selfieData,
      )
    } catch (embeddingError) {
      log.warn('match: selfie embedding failed', { eventId, error: String(embeddingError) })
      return c.json({ error: 'Unable to process selfie', code: 'EMBEDDING_FAILED' }, 502)
    }

    const photos = await db.execute({
      sql: `SELECT p.id, p.r2_key, p.thumbnail_800_key, p.width, p.height, f.bbox, fe.embedding
            FROM photos p
            JOIN faces f ON f.photo_id = p.id
            JOIN face_embeddings fe ON fe.face_id = f.id
            WHERE p.event_id = ?`,
      args: [eventId],
    })

    const faceRows = photos.rows.map((row) => {
      const photo = row as Record<string, unknown>
      return {
        eventId,
        photoId: String(photo.id),
        embedding: photo.embedding,
        bbox: parseBbox(photo.bbox),
      }
    })
    const calculatedMatches = findMatches({
      eventId,
      selfieEmbedding,
      threshold,
      faces: faceRows,
    })
    const assets = new Map<string, Record<string, unknown>>()
    for (const row of photos.rows) {
      const photo = row as Record<string, unknown>
      assets.set(String(photo.id), photo)
    }

    const matches = []
    for (const calculated of calculatedMatches) {
      const photo = assets.get(calculated.photoId)
      const r2Key = typeof photo?.r2_key === 'string' ? photo.r2_key : null
      const thumbnailKey =
        typeof photo?.thumbnail_800_key === 'string' ? photo.thumbnail_800_key : null
      if (!r2Key || !thumbnailKey) continue
      const [url, thumbnailUrl] = await Promise.all([
        createSignedR2Url(c.env, r2Key, 'GET', 300),
        createSignedR2Url(c.env, thumbnailKey, 'GET', 300),
      ])

      matches.push({
        photoId: calculated.photoId,
        similarity: calculated.similarity,
        url,
        thumbnailUrl,
        width: Number(photo?.width) || 0,
        height: Number(photo?.height) || 0,
        faces: calculated.faces,
      })
    }

    const matchedCount = matches.length
    const processingTime = Date.now() - startTime
    log.info('match: completed', { eventId, matchedCount, threshold, processingTime })

    c.executionCtx.waitUntil(
      (async () => {
        try {
          const sessionId = `ms_${crypto.randomUUID().slice(0, 8)}`
          await db.execute({
            sql: `INSERT INTO match_sessions (id, event_id, user_ip, matched_count, similarity_threshold, created_at)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [
              sessionId,
              eventId,
              clientId,
              matchedCount,
              threshold,
              Math.floor(Date.now() / 1000),
            ],
          })
        } catch (trackError) {
          log.error('match: failed to track session', { eventId, error: String(trackError) })
        }
      })(),
    )

    return c.json({
      matches,
      totalMatches: matchedCount,
      processingTime,
    })
  } catch (err) {
    log.error('match: error', { eventId, error: String(err) })
    sentry.captureException(err, { route: 'match', eventId })
    return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})

export { app as match }
