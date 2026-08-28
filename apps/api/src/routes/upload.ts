import { Hono } from 'hono'
import { z } from 'zod'
import { api } from '../../convex/_generated/api'
import type { AppContext } from '../index'
import { createConvexClient, hasConvexError } from '../lib/convex'
import { buildProcessingRequest, requestProcessingAcceptance } from '../lib/modal'
import { hashOrganizerAuthorization } from '../lib/organizer-auth'
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

    const organizerTokenHash = await hashOrganizerAuthorization(c.req.header('authorization'))
    if (!organizerTokenHash) {
      return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
    }
    const event = await createConvexClient(c.env).query(api.events.getUploadState, {
      serviceSecret: c.env.CONVEX_SERVICE_SECRET,
      publicId: eventId,
      organizerTokenHash,
      now: Math.floor(Date.now() / 1000),
    })
    if (!event) {
      return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
    }
    if (event.status !== 'processing' || event.hasProcessingJob) {
      return c.json({ error: 'Event is no longer accepting uploads', code: 'UPLOADS_CLOSED' }, 409)
    }

    const body = await c.req.json()
    const parsed = uploadSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, 400)
    }

    const { photos } = parsed.data
    if (event.photoCount + photos.length > event.maxPhotos) {
      return c.json({ error: 'Event photo limit exceeded', code: 'MAX_PHOTOS_EXCEEDED' }, 409)
    }
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
    if (hasConvexError(err, 'UNAUTHORIZED')) {
      return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
    }
    if (hasConvexError(err, 'EVENT_EXPIRED')) {
      return c.json({ error: 'Event expired', code: 'EXPIRED' }, 410)
    }
    if (hasConvexError(err, 'EVENT_DELETING')) {
      return c.json({ error: 'Event is no longer accepting uploads', code: 'UPLOADS_CLOSED' }, 409)
    }
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

    const organizerTokenHash = await hashOrganizerAuthorization(c.req.header('authorization'))
    if (!organizerTokenHash) {
      return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
    }

    const parsed = confirmUploadSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, 400)
    }
    const { photoIds } = parsed.data
    const now = Math.floor(Date.now() / 1000)
    const convex = createConvexClient(c.env)
    const event = await convex.query(api.events.getUploadState, {
      serviceSecret: c.env.CONVEX_SERVICE_SECRET,
      publicId: eventId,
      organizerTokenHash,
      now,
    })
    if (!event) {
      return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
    }
    if (event.status !== 'processing' && event.status !== 'failed') {
      return c.json({ error: 'Event is no longer accepting uploads', code: 'UPLOADS_CLOSED' }, 409)
    }
    if (!event.hasProcessingJob && event.photoCount + photoIds.length > event.maxPhotos) {
      return c.json({ error: 'Event photo limit exceeded', code: 'MAX_PHOTOS_EXCEEDED' }, 409)
    }

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

    const confirmation = await convex.mutation(api.uploads.confirm, {
      serviceSecret: c.env.CONVEX_SERVICE_SECRET,
      eventPublicId: eventId,
      organizerTokenHash,
      jobPublicId: `job_${crypto.randomUUID()}`,
      now,
      photos: uploads.map(({ photoId, key, object }) => ({
        publicId: photoId,
        originalKey: key,
        fileSize: object!.size,
      })),
    })

    if (!confirmation.shouldDispatch) {
      if (!confirmation.modalJobId) {
        return c.json(
          { error: 'Event upload processing is pending', code: 'PROCESSING_PENDING' },
          409,
        )
      }
      return c.json({ status: 'processing', jobId: confirmation.jobId, estimatedTime: 120 }, 202)
    }

    const processingRequest = buildProcessingRequest(
      confirmation.jobId,
      eventId,
      uploads.map(({ photoId, key }) => ({ id: photoId, r2Key: key })),
    )
    let modalJobId: string
    try {
      modalJobId = await requestProcessingAcceptance(
        c.env.MODAL_WEBHOOK_URL,
        c.env.MODAL_TOKEN,
        processingRequest,
      )
    } catch (modalError) {
      await convex.mutation(api.processing.markDispatchFailed, {
        serviceSecret: c.env.CONVEX_SERVICE_SECRET,
        eventPublicId: eventId,
        jobPublicId: confirmation.jobId,
        sanitizedError: 'Modal did not accept the processing request',
        now: Math.floor(Date.now() / 1000),
      })
      sentry.captureException(modalError, {
        route: 'modalWebhook',
        eventId,
        jobId: confirmation.jobId,
      })
      return c.json(
        { error: 'Processing service unavailable', code: 'PROCESSING_TRIGGER_FAILED' },
        502,
      )
    }

    await convex.mutation(api.processing.markAccepted, {
      serviceSecret: c.env.CONVEX_SERVICE_SECRET,
      eventPublicId: eventId,
      jobPublicId: confirmation.jobId,
      modalJobId,
      now: Math.floor(Date.now() / 1000),
    })

    log.info('upload: confirmed', { eventId, photoCount: photoIds.length })
    return c.json(
      {
        status: 'processing',
        jobId: confirmation.jobId,
        estimatedTime: 120,
      },
      202,
    )
  } catch (err) {
    if (hasConvexError(err, 'EVENT_NOT_FOUND')) {
      return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
    }
    if (hasConvexError(err, 'UNAUTHORIZED')) {
      return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
    }
    if (hasConvexError(err, 'EVENT_EXPIRED')) {
      return c.json({ error: 'Event expired', code: 'EXPIRED' }, 410)
    }
    if (
      hasConvexError(err, 'EVENT_DELETING') ||
      hasConvexError(err, 'UPLOADS_CLOSED') ||
      hasConvexError(err, 'PHOTO_CONFIRMATION_CONFLICT')
    ) {
      return c.json({ error: 'Event is no longer accepting uploads', code: 'UPLOADS_CLOSED' }, 409)
    }
    if (hasConvexError(err, 'MAX_PHOTOS_EXCEEDED')) {
      return c.json({ error: 'Event photo limit exceeded', code: 'MAX_PHOTOS_EXCEEDED' }, 409)
    }
    log.error('upload: confirm error', { eventId, error: String(err) })
    sentry.captureException(err, { route: 'confirmUpload', eventId })
    return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})

export { app as upload }
