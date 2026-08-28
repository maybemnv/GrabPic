import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import { eventByPublicId, requireOrganizer } from './lib/events'
import { requireServiceSecret } from './lib/validation'

async function markDeleting(ctx: MutationCtx, eventPublicId: string, now: number) {
  const event = await eventByPublicId(ctx, eventPublicId)
  if (!event) throw new Error('EVENT_NOT_FOUND')
  if (event.status !== 'deleting') {
    await ctx.db.patch(event._id, {
      status: 'deleting',
      deletionStartedAt: now,
      deletionUpdatedAt: now,
      deletionError: undefined,
    })
  }
  const job = await ctx.db
    .query('processingJobs')
    .withIndex('by_event_status', (query) => query.eq('eventId', event._id))
    .first()
  if (job?.modalJobId && (job.status === 'accepted' || job.status === 'processing')) {
    await ctx.db.patch(job._id, { status: 'cancelling', updatedAt: now })
  }
  return event
}

export const beginOrganizer = mutation({
  args: {
    serviceSecret: v.string(),
    eventPublicId: v.string(),
    organizerTokenHash: v.string(),
    now: v.number(),
  },
  returns: v.object({ deleting: v.literal(true) }),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const event = await eventByPublicId(ctx, args.eventPublicId)
    if (!event) throw new Error('EVENT_NOT_FOUND')
    requireOrganizer(event, args.organizerTokenHash)
    await markDeleting(ctx, args.eventPublicId, args.now)
    return { deleting: true as const }
  },
})

export const beginExpired = mutation({
  args: { serviceSecret: v.string(), eventPublicId: v.string(), now: v.number() },
  returns: v.object({ deleting: v.literal(true) }),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const event = await eventByPublicId(ctx, args.eventPublicId)
    if (!event) throw new Error('EVENT_NOT_FOUND')
    if (event.status !== 'deleting' && event.expiresAt > args.now) throw new Error('NOT_EXPIRED')
    await markDeleting(ctx, args.eventPublicId, args.now)
    return { deleting: true as const }
  },
})

export const listCandidates = query({
  args: { serviceSecret: v.string(), now: v.number() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const deleting = await ctx.db
      .query('events')
      .withIndex('by_status', (query) => query.eq('status', 'deleting'))
      .take(100)
    const ids = new Set(deleting.map((event) => event.publicId))
    if (ids.size < 100) {
      const expired = await ctx.db
        .query('events')
        .withIndex('by_expires_at', (query) => query.lte('expiresAt', args.now))
        .take(100 - ids.size)
      for (const event of expired) ids.add(event.publicId)
    }
    return [...ids]
  },
})

export const getState = query({
  args: { serviceSecret: v.string(), eventPublicId: v.string() },
  returns: v.union(
    v.object({
      eventPublicId: v.string(),
      photoCount: v.number(),
      storageBytes: v.number(),
      objectKeys: v.array(v.string()),
      modalJobId: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const event = await eventByPublicId(ctx, args.eventPublicId)
    if (!event) return null
    if (event.status !== 'deleting') throw new Error('EVENT_NOT_DELETING')
    const photos = await ctx.db
      .query('photos')
      .withIndex('by_event', (query) => query.eq('eventId', event._id))
      .collect()
    const objectKeys = new Set<string>()
    for (const photo of photos) {
      objectKeys.add(photo.originalKey)
      if (photo.thumbnail200Key) objectKeys.add(photo.thumbnail200Key)
      if (photo.thumbnail800Key) objectKeys.add(photo.thumbnail800Key)
    }
    const job = await ctx.db
      .query('processingJobs')
      .withIndex('by_event_status', (query) => query.eq('eventId', event._id))
      .first()
    const shouldCancel =
      typeof job?.modalJobId === 'string' &&
      ['accepted', 'processing', 'cancelling'].includes(job.status)
    return {
      eventPublicId: event.publicId,
      photoCount: photos.length,
      storageBytes: photos.reduce((total, photo) => total + photo.fileSize, 0),
      objectKeys: [...objectKeys],
      ...(shouldCancel ? { modalJobId: job.modalJobId } : {}),
    }
  },
})

export const markModalCancelled = mutation({
  args: { serviceSecret: v.string(), eventPublicId: v.string(), now: v.number() },
  returns: v.object({ recorded: v.boolean() }),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const event = await eventByPublicId(ctx, args.eventPublicId)
    if (!event) return { recorded: false }
    if (event.status !== 'deleting') throw new Error('EVENT_NOT_DELETING')
    const job = await ctx.db
      .query('processingJobs')
      .withIndex('by_event_status', (query) => query.eq('eventId', event._id))
      .first()
    if (!job || job.status === 'cancelled') return { recorded: false }
    await ctx.db.patch(job._id, { status: 'cancelled', updatedAt: args.now })
    return { recorded: true }
  },
})

export const recordFailure = mutation({
  args: {
    serviceSecret: v.string(),
    eventPublicId: v.string(),
    sanitizedError: v.string(),
    now: v.number(),
  },
  returns: v.object({ recorded: v.boolean() }),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const event = await eventByPublicId(ctx, args.eventPublicId)
    if (!event) return { recorded: false }
    if (event.status !== 'deleting') throw new Error('EVENT_NOT_DELETING')
    await ctx.db.patch(event._id, {
      deletionAttempts: event.deletionAttempts + 1,
      deletionError: args.sanitizedError.slice(0, 500),
      deletionUpdatedAt: args.now,
    })
    return { recorded: true }
  },
})

export const purgeBatch = mutation({
  args: { serviceSecret: v.string(), eventPublicId: v.string() },
  returns: v.object({ deletedRecords: v.number(), eventDeleted: v.boolean() }),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const event = await eventByPublicId(ctx, args.eventPublicId)
    if (!event) return { deletedRecords: 0, eventDeleted: true }
    if (event.status !== 'deleting') throw new Error('EVENT_NOT_DELETING')

    let deletedRecords = 0
    const faces = await ctx.db
      .query('faces')
      .withIndex('by_event', (query) => query.eq('eventId', event._id))
      .take(500)
    for (const face of faces) await ctx.db.delete(face._id)
    deletedRecords += faces.length

    if (deletedRecords < 500) {
      const sessions = await ctx.db
        .query('matchSessions')
        .withIndex('by_event', (query) => query.eq('eventId', event._id))
        .take(500 - deletedRecords)
      for (const session of sessions) await ctx.db.delete(session._id)
      deletedRecords += sessions.length
    }
    if (deletedRecords < 500) {
      const jobs = await ctx.db
        .query('processingJobs')
        .withIndex('by_event_status', (query) => query.eq('eventId', event._id))
        .take(500 - deletedRecords)
      for (const job of jobs) await ctx.db.delete(job._id)
      deletedRecords += jobs.length
    }
    if (deletedRecords < 500) {
      const photos = await ctx.db
        .query('photos')
        .withIndex('by_event', (query) => query.eq('eventId', event._id))
        .take(500 - deletedRecords)
      for (const photo of photos) await ctx.db.delete(photo._id)
      deletedRecords += photos.length
    }

    const remaining = await Promise.all([
      ctx.db
        .query('faces')
        .withIndex('by_event', (query) => query.eq('eventId', event._id))
        .first(),
      ctx.db
        .query('matchSessions')
        .withIndex('by_event', (query) => query.eq('eventId', event._id))
        .first(),
      ctx.db
        .query('processingJobs')
        .withIndex('by_event_status', (query) => query.eq('eventId', event._id))
        .first(),
      ctx.db
        .query('photos')
        .withIndex('by_event', (query) => query.eq('eventId', event._id))
        .first(),
    ])
    if (remaining.every((document) => document === null)) {
      await ctx.db.delete(event._id)
      return { deletedRecords, eventDeleted: true }
    }
    return { deletedRecords, eventDeleted: false }
  },
})
