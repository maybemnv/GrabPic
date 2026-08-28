// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, internal } from '../apps/api/convex/_generated/api'
import schema from '../apps/api/convex/schema'

const modules = import.meta.glob([
  '../apps/api/convex/**/*.ts',
  '../apps/api/convex/**/*.js',
  '!../apps/api/convex/**/*.d.ts',
])
const serviceSecret = 'worker-secret'

async function seedEvents(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const base = {
      createdAt: 1_700_000_000,
      expiresAt: 1_800_000_000,
      status: 'ready' as const,
      photoCount: 1,
      faceCount: 1,
      organizerEmail: 'organizer@example.invalid',
      organizerName: 'Organizer',
      maxPhotos: 100,
      tier: 'free' as const,
      matchThreshold: 0.6,
      clusteringEps: 0.4,
      deletionAttempts: 0,
    }
    const first = await ctx.db.insert('events', {
      ...base,
      publicId: 'evt_11111111',
      name: 'First',
      passcode: '111111',
      inviteToken: '1'.repeat(32),
      organizerTokenHash: 'a'.repeat(64),
    })
    const second = await ctx.db.insert('events', {
      ...base,
      publicId: 'evt_22222222',
      name: 'Second',
      passcode: '222222',
      inviteToken: '2'.repeat(32),
      organizerTokenHash: 'b'.repeat(64),
    })
    const firstPhoto = await ctx.db.insert('photos', {
      publicId: 'photo_11111111',
      eventId: first,
      originalKey: 'events/evt_11111111/photo_11111111.jpg',
      thumbnail800Key: 'events/evt_11111111/thumbs/800/photo_11111111.jpg',
      uploadedAt: 1_700_000_000,
      fileSize: 100,
      processingState: 'processed',
      faceCount: 1,
    })
    const secondPhoto = await ctx.db.insert('photos', {
      publicId: 'photo_22222222',
      eventId: second,
      originalKey: 'events/evt_22222222/photo_22222222.jpg',
      thumbnail800Key: 'events/evt_22222222/thumbs/800/photo_22222222.jpg',
      uploadedAt: 1_700_000_000,
      fileSize: 100,
      processingState: 'processed',
      faceCount: 1,
    })
    const face = {
      bbox: { x: 1, y: 2, width: 3, height: 4 },
      confidence: 0.99,
      embedding: [1, ...Array<number>(511).fill(0)],
    }
    const firstFace = await ctx.db.insert('faces', {
      ...face,
      publicId: 'face_11111111',
      eventId: first,
      photoId: firstPhoto,
    })
    const secondFace = await ctx.db.insert('faces', {
      ...face,
      publicId: 'face_22222222',
      eventId: second,
      photoId: secondPhoto,
    })
    return { first, firstFace, secondFace }
  })
}

describe('Convex match access', () => {
  beforeEach(() => {
    process.env.CONVEX_SERVICE_SECRET = serviceSecret
  })

  it('authorizes the attendee credential and requires a ready event', async () => {
    const t = convexTest(schema, modules)
    await seedEvents(t)

    await expect(
      t.query(api.matches.authorize, {
        serviceSecret,
        eventPublicId: 'evt_11111111',
        passcode: '111111',
        now: 1_700_000_100,
      }),
    ).resolves.toEqual({ ready: true })
    await expect(
      t.query(api.matches.authorize, {
        serviceSecret,
        eventPublicId: 'evt_11111111',
        passcode: '222222',
        now: 1_700_000_100,
      }),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('drops wrong-event faces even if candidate IDs are supplied', async () => {
    const t = convexTest(schema, modules)
    const { first, firstFace, secondFace } = await seedEvents(t)

    const candidates = await t.query(internal.matches.loadCandidates, {
      eventId: first,
      candidates: [
        { faceId: firstFace, score: 0.9 },
        { faceId: secondFace, score: 1 },
      ],
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0].photoId).toBe('photo_11111111')
  })

  it('does not insert match metrics after the event is deleting or gone', async () => {
    const t = convexTest(schema, modules)
    const { first } = await seedEvents(t)
    await t.run(async (ctx) => {
      await ctx.db.patch(first, { status: 'deleting' })
    })

    await t.mutation(internal.matches.recordSession, {
      publicId: 'ms_deleting',
      eventId: first,
      matchedCount: 1,
      similarityThreshold: 0.6,
      durationMs: 10,
      createdAt: 1_700_000_200,
    })

    expect(await t.run(async (ctx) => await ctx.db.query('matchSessions').collect())).toEqual([])
  })
})
