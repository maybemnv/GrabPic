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

describe('queued processor dispatch state', () => {
  beforeEach(() => {
    process.env.CONVEX_SERVICE_SECRET = serviceSecret
  })

  it('returns only persisted photo references after acceptance, then hides deleted jobs', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.events.create, {
      serviceSecret,
      publicId: 'evt_1234abcd',
      name: 'Fixture',
      passcode: '123456',
      inviteToken: '0123456789abcdef0123456789abcdef',
      organizerTokenHash: 'a'.repeat(64),
      createdAt: 1_700_000_000,
      expiresAt: 1_800_000_000,
      organizerEmail: 'organizer@example.invalid',
      organizerName: 'Organizer',
      maxPhotos: 100,
      tier: 'free',
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
    const args = { serviceSecret, eventPublicId: 'evt_1234abcd', jobPublicId: 'job_1', attempt: 1 }
    expect(await t.query(api.processing.getDispatchState, args)).toEqual({
      state: 'pending',
      photos: [],
    })
    await t.mutation(api.processing.markAccepted, {
      ...args,
      modalJobId: 'job_1',
      now: 1_700_000_101,
    })
    expect(await t.query(api.processing.getDispatchState, args)).toEqual({
      state: 'accepted',
      photos: [{ photo_id: 'photo_1234abcd', r2_key: 'events/evt_1234abcd/photo_1234abcd.jpg' }],
    })
    expect(await t.query(api.processing.getDispatchState, { ...args, attempt: 2 })).toEqual({
      state: 'gone',
      photos: [],
    })
  })
})

it('recovers a lost queue message until durable delivery and excludes stale attempts', async () => {
  process.env.CONVEX_SERVICE_SECRET = serviceSecret
  const t = convexTest(schema, modules)
  await t.mutation(api.events.create, {
    serviceSecret,
    publicId: 'evt_1234abcd',
    name: 'Replay',
    passcode: '654321',
    inviteToken: '0123456789abcdef0123456789abcdef',
    organizerTokenHash: 'a'.repeat(64),
    createdAt: 100,
    expiresAt: 100000,
    organizerEmail: 'a@b.test',
    organizerName: 'A',
    maxPhotos: 100,
    tier: 'free',
    matchThreshold: 0.6,
    clusteringEps: 0.4,
  })
  await t.mutation(api.uploads.confirm, {
    serviceSecret,
    eventPublicId: 'evt_1234abcd',
    organizerTokenHash: 'a'.repeat(64),
    jobPublicId: 'job_replay',
    now: 100,
    photos: [
      {
        publicId: 'photo_1234abcd',
        originalKey: 'events/evt_1234abcd/photo_1234abcd.jpg',
        fileSize: 10,
      },
    ],
  })
  const args = {
    serviceSecret,
    eventPublicId: 'evt_1234abcd',
    jobPublicId: 'job_replay',
    attempt: 1,
  }
  expect(await t.mutation(api.processing.listUndelivered, { serviceSecret, now: 4000 })).toEqual([
    { event_id: 'evt_1234abcd', job_id: 'job_replay', attempt: 1 },
  ])
  await t.mutation(api.processing.markAccepted, { ...args, modalJobId: 'job_replay', now: 4000 })
  expect(await t.mutation(api.processing.listUndelivered, { serviceSecret, now: 4001 })).toEqual([])
  expect(
    await t.mutation(api.processing.listUndelivered, { serviceSecret, now: 8000 }),
  ).toHaveLength(1)
  await expect(
    t.mutation(api.processing.markDelivered, { ...args, attempt: 2, now: 8000 }),
  ).rejects.toThrow('STALE_JOB')
  await t.mutation(api.processing.markDelivered, { ...args, now: 8000 })
  await t.mutation(api.processing.markDelivered, { ...args, now: 8001 })
  expect(await t.mutation(api.processing.listUndelivered, { serviceSecret, now: 12000 })).toEqual(
    [],
  )
  expect(await t.query(api.processing.getDispatchState, args)).toEqual({
    state: 'gone',
    photos: [],
  })
  await t.mutation(api.processing.markProcessingFailed, {
    ...args,
    sanitizedError: 'failed inference',
    now: 12001,
  })
  const retry = await t.mutation(api.uploads.confirm, {
    serviceSecret,
    eventPublicId: 'evt_1234abcd',
    organizerTokenHash: 'a'.repeat(64),
    jobPublicId: 'ignored_retry_id',
    now: 12002,
    photos: [
      {
        publicId: 'photo_1234abcd',
        originalKey: 'events/evt_1234abcd/photo_1234abcd.jpg',
        fileSize: 10,
      },
    ],
  })
  expect(retry.attempt).toBe(2)
  expect(await t.mutation(api.processing.listUndelivered, { serviceSecret, now: 16000 })).toEqual([
    { event_id: 'evt_1234abcd', job_id: 'job_replay', attempt: 2 },
  ])
})

it('does not regress a delivered processing callback or replay expired/deleting jobs', async () => {
  process.env.CONVEX_SERVICE_SECRET = serviceSecret
  const t = convexTest(schema, modules)
  const ids = await t.run(async (ctx) => {
    const event = await ctx.db.insert('events', {
      publicId: 'evt_1234abcd',
      name: 'Race',
      passcode: '123456',
      inviteToken: 'b'.repeat(32),
      organizerTokenHash: 'a'.repeat(64),
      createdAt: 1,
      expiresAt: 100000,
      organizerEmail: 'a@b.test',
      organizerName: 'A',
      maxPhotos: 100,
      tier: 'free',
      matchThreshold: 0.6,
      clusteringEps: 0.4,
      deletionAttempts: 0,
      status: 'processing',
      photoCount: 0,
      faceCount: 0,
    })
    const job = await ctx.db.insert('processingJobs', {
      publicId: 'job_race',
      eventId: event,
      photoIds: [],
      status: 'processing',
      attempts: 1,
      createdAt: 1,
      updatedAt: 1,
      deliveredAt: 5,
    })
    return { event, job }
  })
  const args = { serviceSecret, eventPublicId: 'evt_1234abcd', jobPublicId: 'job_race', attempt: 1 }
  await t.mutation(api.processing.markAccepted, { ...args, modalJobId: 'job_race', now: 4000 })
  expect(await t.mutation(api.processing.listUndelivered, { serviceSecret, now: 8000 })).toEqual([])
  await t.run(async (ctx) => {
    expect((await ctx.db.get(ids.job))!.status).toBe('processing')
    await ctx.db.patch(ids.job, { status: 'accepted', deliveredAt: undefined })
    await ctx.db.patch(ids.event, { status: 'deleting' })
  })
  expect(await t.mutation(api.processing.listUndelivered, { serviceSecret, now: 8000 })).toEqual([])
  await t.run(async (ctx) => ctx.db.patch(ids.event, { status: 'processing', expiresAt: 5000 }))
  expect(await t.mutation(api.processing.listUndelivered, { serviceSecret, now: 8000 })).toEqual([])
  expect(await t.query(api.processing.getDispatchState, args)).toEqual({
    state: 'gone',
    photos: [],
  })
})

it('advances past a full page of expired jobs without dispatching them', async () => {
  process.env.CONVEX_SERVICE_SECRET = serviceSecret
  const t = convexTest(schema, modules)
  await t.run(async (ctx) => {
    for (let i = 0; i < 51; i++) {
      const eventId = await ctx.db.insert('events', {
        publicId: `evt_${String(i).padStart(8, '0')}`,
        name: 'Fairness',
        passcode: String(i).padStart(6, '0'),
        inviteToken: String(i).padStart(32, '0'),
        organizerTokenHash: 'a'.repeat(64),
        createdAt: 1,
        expiresAt: i < 50 ? 2 : 100000,
        status: 'processing',
        organizerEmail: 'a@b.test',
        organizerName: 'A',
        photoCount: 0,
        faceCount: 0,
        maxPhotos: 100,
        tier: 'free',
        matchThreshold: 0.6,
        clusteringEps: 0.4,
        deletionAttempts: 0,
      })
      await ctx.db.insert('processingJobs', {
        publicId: `job_${i}`,
        eventId,
        photoIds: [],
        status: 'pending',
        attempts: 1,
        createdAt: 1,
        updatedAt: i + 1,
      })
    }
  })
  expect(await t.mutation(api.processing.listUndelivered, { serviceSecret, now: 8000 })).toEqual([])
  expect(await t.mutation(api.processing.listUndelivered, { serviceSecret, now: 8000 })).toEqual([
    { event_id: 'evt_00000050', job_id: 'job_50', attempt: 1 },
  ])
})
