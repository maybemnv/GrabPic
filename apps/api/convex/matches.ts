import { v } from 'convex/values'
import { action, internalMutation, internalQuery, query } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { eventByPublicId } from './lib/events'
import {
  requireServiceSecret,
  timingSafeEqual,
  validateNormalizedEmbedding,
} from './lib/validation'
import { selectVectorMatches } from './lib/vectorMatching'

const accessArgs = {
  eventPublicId: v.string(),
  passcode: v.optional(v.string()),
  inviteToken: v.optional(v.string()),
  now: v.number(),
}

const bbox = v.object({
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
})

interface MatchSearchResult {
  threshold: number
  matches: Array<{
    photoId: string
    originalKey: string
    thumbnail800Key: string
    width?: number
    height?: number
    bbox: { x: number; y: number; width: number; height: number }
    score: number
  }>
}

async function requireMatchEvent(
  ctx: QueryCtx,
  args: {
    eventPublicId: string
    passcode?: string
    inviteToken?: string
    now: number
  },
) {
  const event = await eventByPublicId(ctx, args.eventPublicId)
  if (!event) throw new Error('EVENT_NOT_FOUND')
  const authorized =
    (args.passcode !== undefined && timingSafeEqual(args.passcode, event.passcode)) ||
    (args.inviteToken !== undefined && timingSafeEqual(args.inviteToken, event.inviteToken))
  if (!authorized) throw new Error('UNAUTHORIZED')
  if (event.status !== 'ready' || event.expiresAt <= args.now) throw new Error('NOT_READY')
  return event
}

export const authorize = query({
  args: { serviceSecret: v.string(), ...accessArgs },
  returns: v.object({ ready: v.literal(true) }),
  handler: async (ctx, args) => {
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    await requireMatchEvent(ctx, args)
    return { ready: true as const }
  },
})

export const resolveEvent = internalQuery({
  args: accessArgs,
  returns: v.object({
    eventId: v.id('events'),
    eventPublicId: v.string(),
    threshold: v.number(),
  }),
  handler: async (ctx, args) => {
    const event = await requireMatchEvent(ctx, args)
    return {
      eventId: event._id,
      eventPublicId: event.publicId,
      threshold: event.matchThreshold,
    }
  },
})

export const loadCandidates = internalQuery({
  args: {
    eventId: v.id('events'),
    candidates: v.array(v.object({ faceId: v.id('faces'), score: v.number() })),
  },
  returns: v.array(
    v.object({
      eventPublicId: v.string(),
      photoId: v.string(),
      originalKey: v.string(),
      thumbnail800Key: v.string(),
      width: v.optional(v.number()),
      height: v.optional(v.number()),
      bbox,
      score: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new Error('EVENT_NOT_FOUND')

    const loaded = await Promise.all(
      args.candidates.map(async ({ faceId, score }) => {
        const face = await ctx.db.get(faceId)
        if (!face || face.eventId !== event._id) return null
        const photo = await ctx.db.get(face.photoId)
        if (!photo || photo.eventId !== event._id || !photo.thumbnail800Key) return null
        return {
          eventPublicId: event.publicId,
          photoId: photo.publicId,
          originalKey: photo.originalKey,
          thumbnail800Key: photo.thumbnail800Key,
          ...(photo.width !== undefined ? { width: photo.width } : {}),
          ...(photo.height !== undefined ? { height: photo.height } : {}),
          bbox: face.bbox,
          score,
        }
      }),
    )
    return loaded.filter((candidate) => candidate !== null)
  },
})

export const recordSession = internalMutation({
  args: {
    publicId: v.string(),
    eventId: v.id('events'),
    matchedCount: v.number(),
    similarityThreshold: v.number(),
    durationMs: v.number(),
    createdAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event || event.status === 'deleting') return null
    await ctx.db.insert('matchSessions', args)
    return null
  },
})

export const search = action({
  args: {
    serviceSecret: v.string(),
    ...accessArgs,
    embedding: v.array(v.float64()),
  },
  returns: v.object({
    threshold: v.number(),
    matches: v.array(
      v.object({
        photoId: v.string(),
        originalKey: v.string(),
        thumbnail800Key: v.string(),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        bbox,
        score: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args): Promise<MatchSearchResult> => {
    const startedAt = Date.now()
    requireServiceSecret(args.serviceSecret, process.env.CONVEX_SERVICE_SECRET)
    const embedding = validateNormalizedEmbedding(args.embedding)
    const event: {
      eventId: Id<'events'>
      eventPublicId: string
      threshold: number
    } = await ctx.runQuery(internal.matches.resolveEvent, {
      eventPublicId: args.eventPublicId,
      passcode: args.passcode,
      inviteToken: args.inviteToken,
      now: args.now,
    })
    const candidates = await ctx.vectorSearch('faces', 'by_embedding', {
      vector: embedding,
      limit: 256,
      filter: (query) => query.eq('eventId', event.eventId),
    })
    const loaded = await ctx.runQuery(internal.matches.loadCandidates, {
      eventId: event.eventId,
      candidates: candidates.map(({ _id, _score }) => ({ faceId: _id, score: _score })),
    })
    const matches = selectVectorMatches({
      eventPublicId: event.eventPublicId,
      threshold: event.threshold,
      candidates: loaded,
    })

    await ctx.runMutation(internal.matches.recordSession, {
      publicId: `ms_${crypto.randomUUID().slice(0, 8)}`,
      eventId: event.eventId,
      matchedCount: matches.length,
      similarityThreshold: event.threshold,
      durationMs: Date.now() - startedAt,
      createdAt: Math.floor(Date.now() / 1000),
    })

    return {
      threshold: event.threshold,
      matches: matches.map(({ eventPublicId: _eventPublicId, score, ...match }) => ({
        ...match,
        score,
      })),
    }
  },
})
