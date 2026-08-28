import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { eventByPublicId, requireActiveEvent, requireOrganizer } from './lib/events'
import { requireServiceSecret } from './lib/validation'

const eventAccess = v.object({
  eventId: v.string(),
  name: v.string(),
  status: v.string(),
})

const organizerEvent = v.object({
  publicId: v.string(),
  name: v.string(),
  passcode: v.string(),
  inviteToken: v.string(),
  createdAt: v.number(),
  expiresAt: v.number(),
  status: v.string(),
  photoCount: v.number(),
  faceCount: v.number(),
  organizerEmail: v.string(),
  organizerName: v.string(),
  maxPhotos: v.number(),
  tier: v.string(),
  matchThreshold: v.number(),
  clusteringEps: v.number(),
})

export const create = mutation({
  args: {
    serviceSecret: v.string(),
    publicId: v.string(),
    name: v.string(),
    passcode: v.string(),
    inviteToken: v.string(),
    organizerTokenHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    organizerEmail: v.string(),
    organizerName: v.string(),
    maxPhotos: v.number(),
    tier: v.union(v.literal('free'), v.literal('pro')),
    matchThreshold: v.number(),
    clusteringEps: v.number(),
  },
  returns: v.object({ eventId: v.string(), passcode: v.string(), inviteToken: v.string() }),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    if (!/^evt_[a-z0-9]{8}$/.test(args.publicId)) throw new Error('INVALID_EVENT_ID')
    if (!/^\d{6}$/.test(args.passcode)) throw new Error('INVALID_PASSCODE')
    if (!/^[a-f0-9]{32}$/.test(args.inviteToken)) throw new Error('INVALID_INVITE_TOKEN')
    if (args.organizerTokenHash.length !== 64) throw new Error('INVALID_ORGANIZER_TOKEN')
    if (args.maxPhotos < 1 || !Number.isInteger(args.maxPhotos)) throw new Error('INVALID_LIMIT')
    if (args.matchThreshold < 0 || args.matchThreshold > 1) throw new Error('INVALID_THRESHOLD')
    if (args.clusteringEps <= 0 || args.clusteringEps > 1) throw new Error('INVALID_CLUSTERING_EPS')

    if (await eventByPublicId(ctx, args.publicId)) throw new Error('EVENT_ID_CONFLICT')
    const passcode = await ctx.db
      .query('events')
      .withIndex('by_passcode', (query) => query.eq('passcode', args.passcode))
      .first()
    if (passcode) throw new Error('PASSCODE_CONFLICT')
    const invite = await ctx.db
      .query('events')
      .withIndex('by_invite_token', (query) => query.eq('inviteToken', args.inviteToken))
      .first()
    if (invite) throw new Error('INVITE_TOKEN_CONFLICT')

    await ctx.db.insert('events', {
      publicId: args.publicId,
      name: args.name,
      passcode: args.passcode,
      inviteToken: args.inviteToken,
      organizerTokenHash: args.organizerTokenHash,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
      status: 'processing',
      photoCount: 0,
      faceCount: 0,
      organizerEmail: args.organizerEmail,
      organizerName: args.organizerName,
      maxPhotos: args.maxPhotos,
      tier: args.tier,
      matchThreshold: args.matchThreshold,
      clusteringEps: args.clusteringEps,
      deletionAttempts: 0,
    })

    return { eventId: args.publicId, passcode: args.passcode, inviteToken: args.inviteToken }
  },
})

export const lookupByPasscode = query({
  args: { serviceSecret: v.string(), passcode: v.string(), now: v.number() },
  returns: v.union(eventAccess, v.null()),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const event = await ctx.db
      .query('events')
      .withIndex('by_passcode', (query) => query.eq('passcode', args.passcode))
      .unique()
    if (!event || event.status === 'deleting' || event.expiresAt <= args.now) return null
    return { eventId: event.publicId, name: event.name, status: event.status }
  },
})

export const lookupByInvite = query({
  args: { serviceSecret: v.string(), inviteToken: v.string(), now: v.number() },
  returns: v.union(eventAccess, v.null()),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const event = await ctx.db
      .query('events')
      .withIndex('by_invite_token', (query) => query.eq('inviteToken', args.inviteToken))
      .unique()
    if (!event || event.status === 'deleting' || event.expiresAt <= args.now) return null
    return { eventId: event.publicId, name: event.name, status: event.status }
  },
})

export const getOrganizerEvent = query({
  args: {
    serviceSecret: v.string(),
    publicId: v.string(),
    organizerTokenHash: v.string(),
  },
  returns: v.union(organizerEvent, v.null()),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const event = await eventByPublicId(ctx, args.publicId)
    if (!event) return null
    requireOrganizer(event, args.organizerTokenHash)
    return {
      publicId: event.publicId,
      name: event.name,
      passcode: event.passcode,
      inviteToken: event.inviteToken,
      createdAt: event.createdAt,
      expiresAt: event.expiresAt,
      status: event.status,
      photoCount: event.photoCount,
      faceCount: event.faceCount,
      organizerEmail: event.organizerEmail,
      organizerName: event.organizerName,
      maxPhotos: event.maxPhotos,
      tier: event.tier,
      matchThreshold: event.matchThreshold,
      clusteringEps: event.clusteringEps,
    }
  },
})

export const getStatus = query({
  args: {
    serviceSecret: v.string(),
    publicId: v.string(),
    organizerTokenHash: v.string(),
  },
  returns: v.union(
    v.object({
      status: v.string(),
      photoCount: v.number(),
      faceCount: v.number(),
      error: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const event = await eventByPublicId(ctx, args.publicId)
    if (!event) return null
    requireOrganizer(event, args.organizerTokenHash)
    const job = await ctx.db
      .query('processingJobs')
      .withIndex('by_event_status', (query) => query.eq('eventId', event._id))
      .first()
    return {
      status: event.status,
      photoCount: event.photoCount,
      faceCount: event.faceCount,
      error: job?.sanitizedError ?? null,
    }
  },
})

export const getUploadState = query({
  args: {
    serviceSecret: v.string(),
    publicId: v.string(),
    organizerTokenHash: v.string(),
    now: v.number(),
  },
  returns: v.union(
    v.object({
      status: v.string(),
      photoCount: v.number(),
      maxPhotos: v.number(),
      hasProcessingJob: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const event = await eventByPublicId(ctx, args.publicId)
    if (!event) return null
    requireOrganizer(event, args.organizerTokenHash)
    requireActiveEvent(event, args.now)
    const job = await ctx.db
      .query('processingJobs')
      .withIndex('by_event_status', (query) => query.eq('eventId', event._id))
      .first()
    return {
      status: event.status,
      photoCount: event.photoCount,
      maxPhotos: event.maxPhotos,
      hasProcessingJob: job !== null,
    }
  },
})
