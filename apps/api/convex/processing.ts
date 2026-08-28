import { v } from 'convex/values'
import { mutation } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import { eventByPublicId } from './lib/events'
import { requireServiceSecret, validateNormalizedEmbedding } from './lib/validation'

async function getJob(ctx: MutationCtx, eventPublicId: string, jobPublicId: string) {
  const event = await eventByPublicId(ctx, eventPublicId)
  if (!event) throw new Error('EVENT_NOT_FOUND')
  if (event.status === 'deleting') throw new Error('EVENT_DELETING')
  const job = await ctx.db
    .query('processingJobs')
    .withIndex('by_public_id', (query) => query.eq('publicId', jobPublicId))
    .unique()
  if (!job || job.eventId !== event._id) throw new Error('JOB_NOT_FOUND')
  return { event, job }
}

export const markAccepted = mutation({
  args: {
    serviceSecret: v.string(),
    eventPublicId: v.string(),
    jobPublicId: v.string(),
    modalJobId: v.string(),
    now: v.number(),
  },
  returns: v.object({ accepted: v.boolean() }),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    if (!args.modalJobId || args.modalJobId.length > 200) throw new Error('INVALID_MODAL_JOB_ID')
    const { job } = await getJob(ctx, args.eventPublicId, args.jobPublicId)
    if (job.modalJobId && job.modalJobId !== args.modalJobId) throw new Error('STALE_JOB')
    if (job.status === 'complete' || job.status === 'cancelled') throw new Error('STALE_JOB')
    await ctx.db.patch(job._id, {
      status: 'accepted',
      modalJobId: args.modalJobId,
      sanitizedError: undefined,
      acceptedAt: job.acceptedAt ?? args.now,
      updatedAt: args.now,
    })
    return { accepted: true }
  },
})

export const markDispatchFailed = mutation({
  args: {
    serviceSecret: v.string(),
    eventPublicId: v.string(),
    jobPublicId: v.string(),
    sanitizedError: v.string(),
    now: v.number(),
  },
  returns: v.object({ recorded: v.boolean() }),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const { job } = await getJob(ctx, args.eventPublicId, args.jobPublicId)
    if (job.modalJobId || job.status === 'accepted' || job.status === 'processing') {
      return { recorded: false }
    }
    await ctx.db.patch(job._id, {
      status: 'failed',
      sanitizedError: args.sanitizedError.slice(0, 500),
      updatedAt: args.now,
    })
    return { recorded: true }
  },
})

const bbox = v.object({
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
})

const landmarks = v.object({
  leftEye: v.array(v.float64()),
  rightEye: v.array(v.float64()),
  nose: v.array(v.float64()),
  leftMouth: v.array(v.float64()),
  rightMouth: v.array(v.float64()),
})

function finiteBox(value: { x: number; y: number; width: number; height: number }): boolean {
  return (
    [value.x, value.y, value.width, value.height].every(Number.isFinite) &&
    value.width > 0 &&
    value.height > 0
  )
}

function sameNumbers(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export const persistResults = mutation({
  args: {
    serviceSecret: v.string(),
    eventPublicId: v.string(),
    jobPublicId: v.string(),
    final: v.boolean(),
    now: v.number(),
    photos: v.array(
      v.object({
        publicId: v.string(),
        thumbnail200Key: v.string(),
        thumbnail800Key: v.string(),
        width: v.number(),
        height: v.number(),
      }),
    ),
    faces: v.array(
      v.object({
        publicId: v.string(),
        photoPublicId: v.string(),
        bbox,
        confidence: v.number(),
        clusterId: v.optional(v.string()),
        landmarks: v.optional(landmarks),
        embedding: v.array(v.float64()),
      }),
    ),
  },
  returns: v.object({
    accepted: v.literal(true),
    duplicate: v.boolean(),
    completed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const { event, job } = await getJob(ctx, args.eventPublicId, args.jobPublicId)
    if (!['accepted', 'processing', 'complete'].includes(job.status)) throw new Error('STALE_JOB')
    if (args.faces.length > 25) throw new Error('TOO_MANY_FACES')
    if (new Set(args.photos.map((photo) => photo.publicId)).size !== args.photos.length) {
      throw new Error('DUPLICATE_PHOTOS')
    }
    if (new Set(args.faces.map((face) => face.publicId)).size !== args.faces.length) {
      throw new Error('DUPLICATE_FACES')
    }

    const jobPhotos = await Promise.all(job.photoIds.map((photoId) => ctx.db.get(photoId)))
    if (jobPhotos.some((photo) => !photo || photo.eventId !== event._id)) {
      throw new Error('JOB_PHOTO_MISMATCH')
    }
    const photosByPublicId = new Map(jobPhotos.map((photo) => [photo!.publicId, photo!]))

    for (const photo of args.photos) {
      if (!photosByPublicId.has(photo.publicId)) throw new Error('PHOTO_NOT_IN_JOB')
      if (
        photo.thumbnail200Key !== `events/${event.publicId}/thumbs/200/${photo.publicId}.jpg` ||
        photo.thumbnail800Key !== `events/${event.publicId}/thumbs/800/${photo.publicId}.jpg`
      ) {
        throw new Error('INVALID_THUMBNAIL_KEY')
      }
      if (
        !Number.isInteger(photo.width) ||
        photo.width <= 0 ||
        !Number.isInteger(photo.height) ||
        photo.height <= 0
      ) {
        throw new Error('INVALID_DIMENSIONS')
      }
    }
    for (const face of args.faces) {
      if (!photosByPublicId.has(face.photoPublicId)) throw new Error('PHOTO_NOT_IN_JOB')
      if (!face.publicId || face.publicId.length > 200) throw new Error('INVALID_FACE_ID')
      if (!finiteBox(face.bbox)) throw new Error('INVALID_BBOX')
      if (!Number.isFinite(face.confidence) || face.confidence < 0.9 || face.confidence > 1) {
        throw new Error('INVALID_CONFIDENCE')
      }
      if (face.landmarks) {
        const points = Object.values(face.landmarks)
        if (
          points.some(
            (point) => point.length !== 2 || point.some((value) => !Number.isFinite(value)),
          )
        ) {
          throw new Error('INVALID_LANDMARKS')
        }
      }
      validateNormalizedEmbedding(face.embedding)
    }

    if (job.status === 'complete') {
      return { accepted: true as const, duplicate: true, completed: true }
    }
    if (args.final && args.photos.length !== job.photoIds.length) throw new Error('INCOMPLETE_JOB')

    const newFacesByPhoto = new Map<string, number>()
    let insertedFaces = 0
    for (const face of args.faces) {
      const photo = photosByPublicId.get(face.photoPublicId)!
      const existing = await ctx.db
        .query('faces')
        .withIndex('by_event_public_id', (query) =>
          query.eq('eventId', event._id).eq('publicId', face.publicId),
        )
        .unique()
      if (existing) {
        if (existing.photoId !== photo._id || !sameNumbers(existing.embedding, face.embedding)) {
          throw new Error('FACE_CONFLICT')
        }
        continue
      }
      await ctx.db.insert('faces', {
        publicId: face.publicId,
        eventId: event._id,
        photoId: photo._id,
        bbox: face.bbox,
        confidence: face.confidence,
        ...(face.clusterId ? { clusterId: face.clusterId } : {}),
        ...(face.landmarks ? { landmarks: face.landmarks } : {}),
        embedding: face.embedding,
      })
      insertedFaces += 1
      newFacesByPhoto.set(photo.publicId, (newFacesByPhoto.get(photo.publicId) ?? 0) + 1)
    }

    for (const result of args.photos) {
      const photo = photosByPublicId.get(result.publicId)!
      await ctx.db.patch(photo._id, {
        thumbnail200Key: result.thumbnail200Key,
        thumbnail800Key: result.thumbnail800Key,
        width: result.width,
        height: result.height,
        processingState: 'processed',
        faceCount: photo.faceCount + (newFacesByPhoto.get(photo.publicId) ?? 0),
      })
    }

    await ctx.db.patch(event._id, {
      faceCount: event.faceCount + insertedFaces,
      ...(args.final ? { status: 'ready' as const } : {}),
    })
    await ctx.db.patch(job._id, {
      status: args.final ? 'complete' : 'processing',
      updatedAt: args.now,
      ...(args.final ? { completedAt: args.now } : {}),
    })

    return {
      accepted: true as const,
      duplicate: insertedFaces === 0,
      completed: args.final,
    }
  },
})

export const markProcessingFailed = mutation({
  args: {
    serviceSecret: v.string(),
    eventPublicId: v.string(),
    jobPublicId: v.string(),
    sanitizedError: v.string(),
    now: v.number(),
  },
  returns: v.object({ recorded: v.boolean() }),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const { event, job } = await getJob(ctx, args.eventPublicId, args.jobPublicId)
    if (job.status === 'complete' || job.status === 'cancelled') throw new Error('STALE_JOB')
    await ctx.db.patch(job._id, {
      status: 'failed',
      sanitizedError: args.sanitizedError.slice(0, 500),
      updatedAt: args.now,
    })
    await ctx.db.patch(event._id, { status: 'failed' })
    return { recorded: true }
  },
})
