import { v } from 'convex/values'
import { mutation } from './_generated/server'
import { eventByPublicId, requireActiveEvent, requireOrganizer } from './lib/events'
import { requireServiceSecret } from './lib/validation'

const confirmationResult = v.object({
  jobId: v.string(),
  attempt: v.number(),
  modalJobId: v.optional(v.string()),
  shouldDispatch: v.boolean(),
})

export const confirm = mutation({
  args: {
    serviceSecret: v.string(),
    eventPublicId: v.string(),
    organizerTokenHash: v.string(),
    jobPublicId: v.string(),
    now: v.number(),
    photos: v.array(
      v.object({
        publicId: v.string(),
        originalKey: v.string(),
        fileSize: v.number(),
      }),
    ),
  },
  returns: confirmationResult,
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const event = await eventByPublicId(ctx, args.eventPublicId)
    if (!event) throw new Error('EVENT_NOT_FOUND')
    requireOrganizer(event, args.organizerTokenHash)
    requireActiveEvent(event, args.now)
    if (args.photos.length < 1 || args.photos.length > 1000) throw new Error('INVALID_PHOTOS')
    if (new Set(args.photos.map((photo) => photo.publicId)).size !== args.photos.length) {
      throw new Error('DUPLICATE_PHOTO_IDS')
    }

    for (const photo of args.photos) {
      if (!/^photo_[a-f0-9]{8}$/i.test(photo.publicId)) throw new Error('INVALID_PHOTO_ID')
      if (photo.originalKey !== `events/${event.publicId}/${photo.publicId}.jpg`) {
        throw new Error('INVALID_PHOTO_KEY')
      }
      if (!Number.isInteger(photo.fileSize) || photo.fileSize <= 0)
        throw new Error('INVALID_FILE_SIZE')
    }

    const existingPhotos = await Promise.all(
      args.photos.map(async (photo) =>
        ctx.db
          .query('photos')
          .withIndex('by_event_public_id', (query) =>
            query.eq('eventId', event._id).eq('publicId', photo.publicId),
          )
          .unique(),
      ),
    )
    const existingJob = await ctx.db
      .query('processingJobs')
      .withIndex('by_event_status', (query) => query.eq('eventId', event._id))
      .first()

    if (existingPhotos.some(Boolean)) {
      if (existingPhotos.some((photo) => photo === null) || !existingJob) {
        throw new Error('PHOTO_CONFIRMATION_CONFLICT')
      }
      const existingIds = new Set(existingPhotos.map((photo) => photo!._id))
      if (
        existingJob.photoIds.length !== existingIds.size ||
        existingJob.photoIds.some((photoId) => !existingIds.has(photoId))
      ) {
        throw new Error('PHOTO_CONFIRMATION_CONFLICT')
      }
      if (existingJob.status === 'failed') {
        let removedFaces = 0
        for (const photo of existingPhotos) {
          const faces = await ctx.db
            .query('faces')
            .withIndex('by_photo', (query) => query.eq('photoId', photo!._id))
            .collect()
          for (const face of faces) await ctx.db.delete(face._id)
          removedFaces += faces.length
          await ctx.db.patch(photo!._id, { processingState: 'pending', faceCount: 0 })
        }
        const attempt = existingJob.attempts + 1
        await ctx.db.patch(existingJob._id, {
          status: 'pending',
          attempts: attempt,
          modalJobId: undefined,
          sanitizedError: undefined,
          updatedAt: args.now,
        })
        await ctx.db.patch(event._id, {
          status: 'processing',
          faceCount: Math.max(0, event.faceCount - removedFaces),
        })
        return { jobId: existingJob.publicId, attempt, shouldDispatch: true }
      }
      return {
        jobId: existingJob.publicId,
        attempt: existingJob.attempts,
        ...(existingJob.modalJobId ? { modalJobId: existingJob.modalJobId } : {}),
        shouldDispatch: false,
      }
    }

    if (event.status !== 'processing') throw new Error('UPLOADS_CLOSED')
    if (existingJob) throw new Error('UPLOADS_CLOSED')
    if (event.photoCount + args.photos.length > event.maxPhotos) {
      throw new Error('MAX_PHOTOS_EXCEEDED')
    }
    const jobConflict = await ctx.db
      .query('processingJobs')
      .withIndex('by_public_id', (query) => query.eq('publicId', args.jobPublicId))
      .first()
    if (jobConflict) throw new Error('JOB_ID_CONFLICT')

    const photoIds = []
    for (const photo of args.photos) {
      photoIds.push(
        await ctx.db.insert('photos', {
          publicId: photo.publicId,
          eventId: event._id,
          originalKey: photo.originalKey,
          uploadedAt: args.now,
          fileSize: photo.fileSize,
          processingState: 'pending',
          faceCount: 0,
        }),
      )
    }
    await ctx.db.insert('processingJobs', {
      publicId: args.jobPublicId,
      eventId: event._id,
      photoIds,
      status: 'pending',
      attempts: 1,
      createdAt: args.now,
      updatedAt: args.now,
    })
    await ctx.db.patch(event._id, { photoCount: event.photoCount + photoIds.length })

    return { jobId: args.jobPublicId, attempt: 1, shouldDispatch: true }
  },
})
