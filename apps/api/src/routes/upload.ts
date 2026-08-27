import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContext } from '../index'
import { buildProcessingRequest } from '../lib/modal'
import { rateLimitKey } from '../lib/rate-limit'
import { createSignedR2Url } from '../lib/r2'

const app = new Hono<AppContext>()

const uploadSchema = z.object({
  photos: z
    .array(
      z.object({
        filename: z.string(),
        size: z
          .number()
          .int()
          .max(50 * 1024 * 1024),
        type: z.string(),
      }),
    )
    .min(1)
    .max(1000),
})

const confirmUploadSchema = z.object({
  photoIds: z.array(z.string().min(1)).min(1).max(1000),
})

app.post('/', async (c) => {
  const eventId = c.req.param('eventId')
  const log = c.get('logger')
  const sentry = c.get('sentry')
  if (!eventId) {
    return c.json({ error: 'Event ID required', code: 'VALIDATION_ERROR' }, 400)
  }

  try {
    const clientId =
      c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
    const limit = await c.env.RATE_LIMITER.limit({
      key: rateLimitKey('upload-initiation', eventId, clientId),
    })
    if (!limit.success) {
      return c.json({ error: 'Too many upload requests', code: 'RATE_LIMITED' }, 429)
    }

    const body = await c.req.json()
    const parsed = uploadSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, 400)
    }

    const { photos } = parsed.data
    const uploadUrls = await Promise.all(
      photos.map(async (photo) => {
        const photoId = `photo_${crypto.randomUUID().slice(0, 8)}`
        const key = `events/${eventId}/${photoId}.jpg`

        const uploadUrl = await createSignedR2Url(c.env, key, 'PUT', 3600, photo.type)

        return { photoId, uploadUrl, filename: photo.filename }
      }),
    )

    log.info('upload: urls generated', { eventId, count: photos.length })
    return c.json({ uploadUrls })
  } catch (err) {
    log.error('upload: generate urls error', { eventId, error: String(err) })
    sentry.captureException(err, { route: 'generateUploadUrls', eventId })
    return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})

app.post('/confirm', async (c) => {
  const eventId = c.req.param('eventId')
  const log = c.get('logger')
  const sentry = c.get('sentry')
  if (!eventId) {
    return c.json({ error: 'Event ID required', code: 'VALIDATION_ERROR' }, 400)
  }

  try {
    const clientId =
      c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
    const limit = await c.env.RATE_LIMITER.limit({
      key: rateLimitKey('upload-confirmation', eventId, clientId),
    })
    if (!limit.success) {
      return c.json({ error: 'Too many upload requests', code: 'RATE_LIMITED' }, 429)
    }

    const parsed = confirmUploadSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, 400)
    }
    const { photoIds } = parsed.data

    const now = Math.floor(Date.now() / 1000)
    const db = (await import('@libsql/client')).createClient({
      url: c.env.TURSO_URL,
      authToken: c.env.TURSO_TOKEN,
    })

    for (const photoId of photoIds) {
      await db.execute({
        sql: `INSERT INTO photos (id, event_id, r2_key, uploaded_at)
              VALUES (?, ?, ?, ?)`,
        args: [photoId, eventId, `events/${eventId}/${photoId}.jpg`, now],
      })
    }

    await db.execute({
      sql: 'UPDATE events SET photo_count = photo_count + ? WHERE id = ?',
      args: [photoIds.length, eventId],
    })

    if (c.env.MODAL_WEBHOOK_URL && c.env.MODAL_TOKEN) {
      const processingRequest = buildProcessingRequest(
        eventId,
        photoIds.map((id) => ({ id, r2Key: `events/${eventId}/${id}.jpg` })),
      )
      c.executionCtx.waitUntil(
        fetch(c.env.MODAL_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${c.env.MODAL_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(processingRequest),
        })
          .then((response) => {
            if (!response.ok) throw new Error(`Modal processing failed with ${response.status}`)
          })
          .catch((modalErr) => {
            sentry.captureException(modalErr, { route: 'modalWebhook', eventId })
          }),
      )
    }

    log.info('upload: confirmed', { eventId, photoCount: photoIds.length })
    return c.json(
      {
        status: 'processing',
        jobId: `job_${eventId}`,
        estimatedTime: 120,
      },
      202,
    )
  } catch (err) {
    log.error('upload: confirm error', { eventId, error: String(err) })
    sentry.captureException(err, { route: 'confirmUpload', eventId })
    return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})

export { app as upload }
