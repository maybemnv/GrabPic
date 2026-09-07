import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const eventStatus = v.union(
  v.literal('processing'),
  v.literal('ready'),
  v.literal('failed'),
  v.literal('expired'),
  v.literal('deleting'),
)

const processingState = v.union(v.literal('pending'), v.literal('processed'), v.literal('failed'))

const jobStatus = v.union(
  v.literal('pending'),
  v.literal('accepted'),
  v.literal('processing'),
  v.literal('complete'),
  v.literal('failed'),
  v.literal('cancelling'),
  v.literal('cancelled'),
)

const landmarks = v.object({
  leftEye: v.array(v.float64()),
  rightEye: v.array(v.float64()),
  nose: v.array(v.float64()),
  leftMouth: v.array(v.float64()),
  rightMouth: v.array(v.float64()),
})

export default defineSchema({
  events: defineTable({
    publicId: v.string(),
    name: v.string(),
    passcode: v.string(),
    inviteToken: v.string(),
    organizerTokenHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    status: eventStatus,
    photoCount: v.number(),
    faceCount: v.number(),
    organizerEmail: v.string(),
    organizerName: v.string(),
    maxPhotos: v.number(),
    tier: v.union(v.literal('free'), v.literal('pro')),
    matchThreshold: v.number(),
    clusteringEps: v.number(),
    deletionAttempts: v.number(),
    deletionError: v.optional(v.string()),
    deletionStartedAt: v.optional(v.number()),
    deletionUpdatedAt: v.optional(v.number()),
  })
    .index('by_public_id', ['publicId'])
    .index('by_passcode', ['passcode'])
    .index('by_invite_token', ['inviteToken'])
    .index('by_expires_at', ['expiresAt'])
    .index('by_status', ['status']),

  photos: defineTable({
    publicId: v.string(),
    eventId: v.id('events'),
    originalKey: v.string(),
    thumbnail200Key: v.optional(v.string()),
    thumbnail800Key: v.optional(v.string()),
    uploadedAt: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    fileSize: v.number(),
    processingState,
    faceCount: v.number(),
  })
    .index('by_event', ['eventId'])
    .index('by_event_public_id', ['eventId', 'publicId']),

  faces: defineTable({
    publicId: v.string(),
    eventId: v.id('events'),
    photoId: v.id('photos'),
    bbox: v.object({
      x: v.number(),
      y: v.number(),
      width: v.number(),
      height: v.number(),
    }),
    confidence: v.number(),
    clusterId: v.optional(v.string()),
    landmarks: v.optional(landmarks),
    embedding: v.array(v.float64()),
  })
    .index('by_event', ['eventId'])
    .index('by_photo', ['photoId'])
    .index('by_event_public_id', ['eventId', 'publicId'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 512,
      filterFields: ['eventId'],
    }),

  matchSessions: defineTable({
    publicId: v.string(),
    eventId: v.id('events'),
    matchedCount: v.number(),
    similarityThreshold: v.number(),
    durationMs: v.number(),
    createdAt: v.number(),
  }).index('by_event', ['eventId']),

  processingJobs: defineTable({
    publicId: v.string(),
    eventId: v.id('events'),
    photoIds: v.array(v.id('photos')),
    status: jobStatus,
    modalJobId: v.optional(v.string()),
    attempts: v.number(),
    sanitizedError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    acceptedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index('by_public_id', ['publicId'])
    .index('by_event_status', ['eventId', 'status']),
})
