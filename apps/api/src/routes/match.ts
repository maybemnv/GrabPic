import { Hono } from 'hono'
import { z } from 'zod'
import { api } from '../../convex/_generated/api'
import type { AppContext } from '../index'
import { createConvexClient, hasConvexError } from '../lib/convex'
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

    const { selfieData, passcode, inviteToken } = parsed.data
    const access = {
      eventPublicId: eventId,
      ...(passcode ? { passcode } : {}),
      ...(inviteToken ? { inviteToken } : {}),
    }
    const convex = createConvexClient(c.env)
    await convex.query(api.matches.authorize, {
      serviceSecret: c.env.CONVEX_SERVICE_SECRET,
      ...access,
      now: Math.floor(Date.now() / 1000),
    })

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

    const search = await convex.action(api.matches.search, {
      serviceSecret: c.env.CONVEX_SERVICE_SECRET,
      ...access,
      now: Math.floor(Date.now() / 1000),
      embedding: Array.from(selfieEmbedding),
    })

    const matches = await Promise.all(
      search.matches.map(async (match) => {
        const [url, thumbnailUrl] = await Promise.all([
          createSignedR2Url(c.env, match.originalKey, 'GET', 300),
          createSignedR2Url(c.env, match.thumbnail800Key, 'GET', 300),
        ])

        return {
          photoId: match.photoId,
          similarity: match.score,
          url,
          thumbnailUrl,
          width: match.width ?? 0,
          height: match.height ?? 0,
          faces: [{ bbox: match.bbox, isMatch: true }],
        }
      }),
    )

    const matchedCount = matches.length
    const processingTime = Date.now() - startTime
    log.info('match: completed', {
      eventId,
      matchedCount,
      threshold: search.threshold,
      processingTime,
    })

    return c.json({
      matches,
      totalMatches: matchedCount,
      processingTime,
    })
  } catch (err) {
    if (hasConvexError(err, 'EVENT_NOT_FOUND')) {
      return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
    }
    if (hasConvexError(err, 'UNAUTHORIZED')) {
      return c.json({ error: 'Invalid passcode', code: 'UNAUTHORIZED' }, 401)
    }
    if (hasConvexError(err, 'NOT_READY')) {
      return c.json({ error: 'Event still processing', code: 'NOT_READY' }, 400)
    }
    // The failing operation may have handled a biometric vector; keep error payloads out of logs.
    log.error('match: error', { eventId })
    sentry.captureMessage('Match request failed', { route: 'match', eventId })
    return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})

export { app as match }
