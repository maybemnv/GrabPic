// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { beforeEach, describe, expect, it } from 'vitest'
import { api } from '../apps/api/convex/_generated/api'
import schema from '../apps/api/convex/schema'

const modules = import.meta.glob([
  '../apps/api/convex/**/*.ts',
  '../apps/api/convex/**/*.js',
  '!../apps/api/convex/**/*.d.ts',
])
const serviceSecret = 'worker-secret'

async function seed(t: ReturnType<typeof convexTest>, expiresAt = 1_800_000_000) {
  await t.mutation(api.events.create, {
    serviceSecret,
    publicId: 'evt_1234abcd',
    name: 'Delete Fixture',
    passcode: '123456',
    inviteToken: '0123456789abcdef0123456789abcdef',
    organizerTokenHash: 'a'.repeat(64),
    createdAt: 1_700_000_000,
    expiresAt,
    organizerEmail: 'organizer@example.invalid',
    organizerName: 'Organizer',
    maxPhotos: 1000,
    tier: 'pro',
    matchThreshold: 0.6,
    clusteringEps: 0.4,
  })
  await t.mutation(api.uploads.confirm, {
    serviceSecret,
    eventPublicId: 'evt_1234abcd',
    organizerTokenHash: 'a'.repeat(64),
    jobPublicId: 'job_1',
    now: 1_700_000_100,
    photos: [
      {
        publicId: 'photo_1234abcd',
        originalKey: 'events/evt_1234abcd/photo_1234abcd.jpg',
        fileSize: 1024,
      },
    ],
  })
  await t.mutation(api.processing.markAccepted, {
    serviceSecret,
    eventPublicId: 'evt_1234abcd',
    jobPublicId: 'job_1',
    attempt: 1,
    modalJobId: 'modal_1',
    now: 1_700_000_101,
  })
  await t.run(async (ctx) => {
    const event = await ctx.db.query('events').first()
    const photo = await ctx.db.query('photos').first()
    if (!event || !photo) throw new Error('fixture missing')
    for (let index = 0; index < 501; index += 1) {
      await ctx.db.insert('faces', {
        publicId: `face_${index}`,
        eventId: event._id,
        photoId: photo._id,
        bbox: { x: 1, y: 2, width: 3, height: 4 },
        confidence: 0.99,
        embedding: [1, ...Array<number>(511).fill(0)],
      })
    }
    await ctx.db.insert('matchSessions', {
      publicId: 'ms_1',
      eventId: event._id,
      matchedCount: 1,
      similarityThreshold: 0.6,
      durationMs: 10,
      createdAt: 1_700_000_200,
    })
  })
}

describe('Convex deletion state', () => {
  beforeEach(() => {
    process.env.CONVEX_SERVICE_SECRET = serviceSecret
  })

  it('purges at most 500 records per mutation and deletes the event last', async () => {
    const t = convexTest(schema, modules)
    await seed(t)
    await t.mutation(api.deletion.beginOrganizer, {
      serviceSecret,
      eventPublicId: 'evt_1234abcd',
      organizerTokenHash: 'a'.repeat(64),
      now: 1_700_000_300,
    })
    await t.mutation(api.deletion.markModalCancelled, {
      serviceSecret,
      eventPublicId: 'evt_1234abcd',
      now: 1_700_000_301,
    })

    const first = await t.mutation(api.deletion.purgeBatch, {
      serviceSecret,
      eventPublicId: 'evt_1234abcd',
    })
    expect(first).toEqual({ deletedRecords: 500, eventDeleted: false })
    expect(await t.run(async (ctx) => await ctx.db.query('events').first())).not.toBeNull()

    let result = first
    while (!result.eventDeleted) {
      result = await t.mutation(api.deletion.purgeBatch, {
        serviceSecret,
        eventPublicId: 'evt_1234abcd',
      })
    }
    const remaining = await t.run(async (ctx) => ({
      events: await ctx.db.query('events').collect(),
      photos: await ctx.db.query('photos').collect(),
      faces: await ctx.db.query('faces').collect(),
      sessions: await ctx.db.query('matchSessions').collect(),
      jobs: await ctx.db.query('processingJobs').collect(),
    }))
    expect(Object.values(remaining).every((rows) => rows.length === 0)).toBe(true)
  })

  it('lists expired and already-deleting events for the same retry workflow', async () => {
    const t = convexTest(schema, modules)
    await seed(t)
    await t.run(async (ctx) => {
      const event = await ctx.db.query('events').first()
      if (!event) throw new Error('fixture missing')
      await ctx.db.patch(event._id, { expiresAt: 1_700_000_050 })
    })

    const candidates = await t.query(api.deletion.listCandidates, {
      serviceSecret,
      now: 1_700_000_100,
    })
    expect(candidates).toContain('evt_1234abcd')

    await t.mutation(api.deletion.beginExpired, {
      serviceSecret,
      eventPublicId: 'evt_1234abcd',
      now: 1_700_000_100,
    })
    const retryCandidates = await t.query(api.deletion.listCandidates, {
      serviceSecret,
      now: 1_700_000_100,
    })
    expect(retryCandidates).toContain('evt_1234abcd')
  })

  it('does not let a full deleting queue starve newly expired events', async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      for (let index = 0; index < 100; index += 1) {
        await ctx.db.insert('events', {
          publicId: `evt_del_${index}`,
          name: 'Deleting',
          passcode: `${String(index).padStart(6, '0')}`,
          inviteToken: `${String(index).padStart(2, '0')}`.repeat(16),
          organizerTokenHash: 'a'.repeat(64),
          createdAt: 1_700_000_000,
          expiresAt: 1_700_000_050,
          status: 'deleting',
          photoCount: 0,
          faceCount: 0,
          organizerEmail: 'organizer@example.invalid',
          organizerName: 'Organizer',
          maxPhotos: 100,
          tier: 'free',
          matchThreshold: 0.6,
          clusteringEps: 0.4,
          deletionAttempts: 1,
        })
      }
      await ctx.db.insert('events', {
        publicId: 'evt_expired_new',
        name: 'Expired',
        passcode: '999999',
        inviteToken: '9'.repeat(32),
        organizerTokenHash: 'b'.repeat(64),
        createdAt: 1_700_000_000,
        expiresAt: 1_700_000_050,
        status: 'ready',
        photoCount: 0,
        faceCount: 0,
        organizerEmail: 'organizer@example.invalid',
        organizerName: 'Organizer',
        maxPhotos: 100,
        tier: 'free',
        matchThreshold: 0.6,
        clusteringEps: 0.4,
        deletionAttempts: 0,
      })
    })

    const candidates = await t.query(api.deletion.listCandidates, {
      serviceSecret,
      now: 1_700_000_100,
    })

    expect(candidates).toContain('evt_expired_new')
    expect(candidates.length).toBeLessThanOrEqual(100)
  })

  it('does not purge while a Modal dispatch is unresolved', async () => {
    const t = convexTest(schema, modules)
    await seed(t)
    await t.run(async (ctx) => {
      const job = await ctx.db.query('processingJobs').first()
      if (!job) throw new Error('fixture missing')
      await ctx.db.patch(job._id, { status: 'pending', modalJobId: undefined })
    })
    await t.mutation(api.deletion.beginOrganizer, {
      serviceSecret,
      eventPublicId: 'evt_1234abcd',
      organizerTokenHash: 'a'.repeat(64),
      now: 1_700_000_300,
    })

    await expect(
      t.mutation(api.deletion.purgeBatch, {
        serviceSecret,
        eventPublicId: 'evt_1234abcd',
      }),
    ).rejects.toMatchObject({ data: { code: 'MODAL_DISPATCH_UNRESOLVED' } })
    expect(await t.run(async (ctx) => await ctx.db.query('events').first())).not.toBeNull()
    expect(await t.run(async (ctx) => await ctx.db.query('processingJobs').first())).not.toBeNull()

    await expect(
      t.mutation(api.processing.markDispatchFailed, {
        serviceSecret,
        eventPublicId: 'evt_1234abcd',
        jobPublicId: 'job_1',
        attempt: 1,
        sanitizedError: 'Modal did not accept the processing request',
        now: 1_700_000_301,
      }),
    ).resolves.toEqual({ recorded: true })
  })
})
