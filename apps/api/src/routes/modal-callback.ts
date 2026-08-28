import { Hono } from 'hono'
import { z } from 'zod'
import { api } from '../../convex/_generated/api'
import type { AppContext } from '../index'
import { createConvexClient, hasConvexError } from '../lib/convex'
import { timingSafeEqual } from '../lib/secure-compare'

const photoSchema = z.object({
  photoId: z.string().min(1).max(200),
  thumbnail200Key: z.string().min(1).max(1000),
  thumbnail800Key: z.string().min(1).max(1000),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

const pointSchema = z.tuple([z.number().finite(), z.number().finite()])
const faceSchema = z.object({
  faceId: z.string().min(1).max(200),
  photoId: z.string().min(1).max(200),
  bbox: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  }),
  confidence: z.number().finite().min(0.9).max(1),
  clusterId: z.string().max(200).nullable().optional(),
  landmarks: z
    .object({
      leftEye: pointSchema,
      rightEye: pointSchema,
      nose: pointSchema,
      leftMouth: pointSchema,
      rightMouth: pointSchema,
    })
    .optional(),
  embedding: z
    .array(z.number().finite())
    .length(512)
    .refine((embedding) => {
      const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0))
      return Math.abs(norm - 1) <= 0.001
    }, 'embedding must be normalized'),
})

const successSchema = z.object({
  status: z.literal('success'),
  jobId: z.string().min(1).max(200),
  eventId: z.string().min(1).max(200),
  attempt: z.number().int().positive(),
  final: z.boolean(),
  photos: z.array(photoSchema).max(1000),
  faces: z.array(faceSchema).max(25),
})

const failureSchema = z.object({
  status: z.literal('failed'),
  jobId: z.string().min(1).max(200),
  eventId: z.string().min(1).max(200),
  attempt: z.number().int().positive(),
})

const callbackSchema = z.discriminatedUnion('status', [successSchema, failureSchema])
const app = new Hono<AppContext>()

app.post('/results', async (c) => {
  if (
    !c.env.MODAL_CALLBACK_TOKEN ||
    !timingSafeEqual(c.req.header('authorization') ?? '', `Bearer ${c.env.MODAL_CALLBACK_TOKEN}`)
  ) {
    return c.json({ error: 'Callback authorization required', code: 'UNAUTHORIZED' }, 401)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid callback payload', code: 'VALIDATION_ERROR' }, 400)
  }
  const parsed = callbackSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid callback payload', code: 'VALIDATION_ERROR' }, 400)
  }

  const convex = createConvexClient(c.env)
  const now = Math.floor(Date.now() / 1000)
  try {
    if (parsed.data.status === 'failed') {
      const result = await convex.mutation(api.processing.markProcessingFailed, {
        serviceSecret: c.env.CONVEX_SERVICE_SECRET,
        eventPublicId: parsed.data.eventId,
        jobPublicId: parsed.data.jobId,
        attempt: parsed.data.attempt,
        sanitizedError: 'Modal processing failed',
        now,
      })
      return c.json(result)
    }

    const result = await convex.mutation(api.processing.persistResults, {
      serviceSecret: c.env.CONVEX_SERVICE_SECRET,
      eventPublicId: parsed.data.eventId,
      jobPublicId: parsed.data.jobId,
      attempt: parsed.data.attempt,
      final: parsed.data.final,
      now,
      photos: parsed.data.photos.map((photo) => ({
        publicId: photo.photoId,
        thumbnail200Key: photo.thumbnail200Key,
        thumbnail800Key: photo.thumbnail800Key,
        width: photo.width,
        height: photo.height,
      })),
      faces: parsed.data.faces.map((face) => ({
        publicId: face.faceId,
        photoPublicId: face.photoId,
        bbox: face.bbox,
        confidence: face.confidence,
        ...(face.clusterId ? { clusterId: face.clusterId } : {}),
        ...(face.landmarks ? { landmarks: face.landmarks } : {}),
        embedding: face.embedding,
      })),
    })
    return c.json(result)
  } catch (error) {
    if (
      [
        'EVENT_NOT_FOUND',
        'EVENT_DELETING',
        'JOB_NOT_FOUND',
        'STALE_JOB',
        'JOB_PHOTO_MISMATCH',
        'PHOTO_NOT_IN_JOB',
        'FACE_CONFLICT',
        'INCOMPLETE_JOB',
      ].some((code) => hasConvexError(error, code))
    ) {
      return c.json({ error: 'Callback rejected', code: 'CALLBACK_REJECTED' }, 409)
    }

    // Callback failures may involve biometric payloads, so never attach the exception or body.
    c.get('logger').error('modal callback: persistence failed')
    c.get('sentry').captureMessage('Modal callback persistence failed', {
      route: 'modalCallback',
    })
    return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})

export { app as modalCallback }
