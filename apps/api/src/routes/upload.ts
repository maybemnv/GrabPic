import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContext } from '../index'
import { buildProcessingRequest } from '../lib/modal'
import { claimProcessingBatch } from '../lib/processing'
import { verifyOrganizerToken } from '../lib/organizer-auth'
import { globalRateLimitKey } from '../lib/rate-limit'
import { createSignedR2Url } from '../lib/r2'
import { isValidUploadedSize, MAX_UPLOAD_BYTES, photoObjectKey } from '../lib/upload'

const app = new Hono<AppContext>()

const uploadSchema = z.object({
  photos: z
    .array(
      z.object({
        filename: z.string(),
        size: z.number().int().max(MAX_UPLOAD_BYTES),
        type: z.string().regex(/^image\//i),
      }),
    )
    .min(1)
    .max(1000),
})

const confirmUploadSchema = z.object({
  photoIds: z
    .array(z.string().regex(/^photo_[a-f0-9]{8}$/i))
    .min(1)
    .max(1000)
    .refine((photoIds) => new Set(photoIds).size === photoIds.length, 'photoIds must be unique'),
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
      key: globalRateLimitKey('upload-initiation', clientId),
    })
    if (!limit.success) {
      return c.json({ error: 'Too many upload requests', code: 'RATE_LIMITED' }, 429)
    }

    const db = (await import('@libsql/client')).createClient({
      url: c.env.TURSO_URL,
      authToken: c.env.TURSO_TOKEN,
    })
    const eventResult = await db.execute({
      sql: 'SELECT id, status, expires_at, processing_batch_id, organizer_token_hash FROM events WHERE id = ?',
      args: [eventId],
    })
    if (eventResult.rows.length === 0) {
      return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
    }
    const event = eventResult.rows[0] as Record<string, unknown>
    if (!(await verifyOrganizerToken(c.req.header('authorization'), event.organizer_token_hash))) {
      return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
    }
    if (Number(event.expires_at) <= Math.floor(Date.now() / 1000) || event.status === 'expired') {
      return c.json({ error: 'Event expired', code: 'EXPIRED' }, 410)
    }
    if (event.status !== 'processing' || event.processing_batch_id) {
      return c.json({ error: 'Event is no longer accepting uploads', code: 'UPLOADS_CLOSED' }, 409)
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
        const key = photoObjectKey(eventId, photoId)

        const uploadUrl = await createSignedR2Url(c.env, key, 'PUT', 3600, photo.type, photo.size)

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
      key: globalRateLimitKey('upload-confirmation', clientId),
    })
    if (!limit.success) {
      return c.json({ error: 'Too many upload requests', code: 'RATE_LIMITED' }, 429)
    }

    const db = (await import('@libsql/client')).createClient({
      url: c.env.TURSO_URL,
      authToken: c.env.TURSO_TOKEN,
    })
    const eventResult = await db.execute({
      sql: 'SELECT id, status, expires_at, processing_batch_id, organizer_token_hash FROM events WHERE id = ?',
      args: [eventId],
    })
    if (eventResult.rows.length === 0) {
      return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
    }
    const event = eventResult.rows[0] as Record<string, unknown>
    if (!(await verifyOrganizerToken(c.req.header('authorization'), event.organizer_token_hash))) {
      return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
    }
    if (Number(event.expires_at) <= Math.floor(Date.now() / 1000) || event.status === 'expired') {
      return c.json({ error: 'Event expired', code: 'EXPIRED' }, 410)
    }
    if (event.status !== 'processing' || event.processing_batch_id) {
      return c.json({ error: 'Event is no longer accepting uploads', code: 'UPLOADS_CLOSED' }, 409)
    }

    const parsed = confirmUploadSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, 400)
    }
    const { photoIds } = parsed.data

    const uploads = await Promise.all(
      photoIds.map(async (photoId) => {
        const key = photoObjectKey(eventId, photoId)
        return { photoId, key, object: await c.env.PHOTOS.head(key) }
      }),
    )
    const missing = uploads.filter(({ object }) => !object)
    if (missing.length > 0) {
      return c.json(
        { error: 'One or more uploaded objects are missing', code: 'UPLOAD_NOT_FOUND' },
        400,
      )
    }
    const oversized = uploads.filter(({ object }) => object && !isValidUploadedSize(object.size))
    if (oversized.length > 0) {
      await Promise.all(oversized.map(({ key }) => c.env.PHOTOS.delete(key)))
      return c.json(
        {
          error: `Uploads must be between 1 byte and ${MAX_UPLOAD_BYTES} bytes`,
          code: 'UPLOAD_TOO_LARGE',
        },
        413,
      )
    }

    const batchId = `job_${crypto.randomUUID()}`
    if (!(await claimProcessingBatch(db, eventId, batchId))) {
      return c.json(
        { error: 'Event upload processing has already started', code: 'UPLOADS_CLOSED' },
        409,
      )
    }

    const now = Math.floor(Date.now() / 1000)

    for (const { photoId, key, object } of uploads) {
      await db.execute({
        sql: `INSERT INTO photos (id, event_id, r2_key, uploaded_at, file_size)
              VALUES (?, ?, ?, ?, ?)`,
        args: [photoId, eventId, key, now, object!.size],
      })
    }

    await db.execute({
      sql: 'UPDATE events SET photo_count = photo_count + ? WHERE id = ?',
      args: [photoIds.length, eventId],
    })

    if (c.env.MODAL_WEBHOOK_URL && c.env.MODAL_TOKEN) {
      const processingRequest = buildProcessingRequest(
        eventId,
        uploads.map(({ photoId, key }) => ({ id: photoId, r2Key: key })),
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
        jobId: batchId,
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
