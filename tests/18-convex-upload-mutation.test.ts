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
const organizerTokenHash = 'a'.repeat(64)

function createEventArgs(maxPhotos = 100) {
  return {
    serviceSecret,
    publicId: 'evt_1234abcd',
    name: 'Fixture Event',
    passcode: '123456',
    inviteToken: '0123456789abcdef0123456789abcdef',
    organizerTokenHash,
    createdAt: 1_700_000_000,
    expiresAt: 1_800_000_000,
    organizerEmail: 'organizer@example.invalid',
    organizerName: 'Organizer',
    maxPhotos,
    tier: 'free' as const,
    matchThreshold: 0.6,
    clusteringEps: 0.4,
  }
}

function confirmArgs(photoIds = ['photo_11111111']) {
  return {
    serviceSecret,
    eventPublicId: 'evt_1234abcd',
    organizerTokenHash,
    jobPublicId: 'job_1',
    now: 1_700_000_100,
    photos: photoIds.map((publicId) => ({
      publicId,
      originalKey: `events/evt_1234abcd/${publicId}.jpg`,
      fileSize: 1024,
    })),
  }
}

describe('Convex upload confirmation mutation', () => {
  beforeEach(() => {
    process.env.CONVEX_SERVICE_SECRET = serviceSecret
  })

  it('atomically creates one job and does not duplicate photos or counts', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.events.create, createEventArgs())

    const first = await t.mutation(api.uploads.confirm, confirmArgs())
    await t.mutation(api.processing.markAccepted, {
      serviceSecret,
      eventPublicId: 'evt_1234abcd',
      jobPublicId: first.jobId,
      modalJobId: 'modal_1',
      now: 1_700_000_101,
    })
    const duplicate = await t.mutation(api.uploads.confirm, {
      ...confirmArgs(),
      jobPublicId: 'job_2',
    })

    expect(first).toMatchObject({ jobId: 'job_1', shouldDispatch: true })
    expect(duplicate).toMatchObject({
      jobId: 'job_1',
      modalJobId: 'modal_1',
      shouldDispatch: false,
    })

    const state = await t.run(async (ctx) => ({
      event: await ctx.db.query('events').first(),
      photos: await ctx.db.query('photos').collect(),
      jobs: await ctx.db.query('processingJobs').collect(),
    }))
    expect(state.event?.photoCount).toBe(1)
    expect(state.photos).toHaveLength(1)
    expect(state.jobs).toHaveLength(1)
  })

  it('rejects the wrong organizer credential without writing state', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.events.create, createEventArgs())

    await expect(
      t.mutation(api.uploads.confirm, {
        ...confirmArgs(),
        organizerTokenHash: 'b'.repeat(64),
      }),
    ).rejects.toThrow('UNAUTHORIZED')

    const photos = await t.run(async (ctx) => await ctx.db.query('photos').collect())
    expect(photos).toEqual([])
  })

  it('enforces maxPhotos inside the atomic confirmation', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.events.create, createEventArgs(1))

    await expect(
      t.mutation(api.uploads.confirm, confirmArgs(['photo_11111111', 'photo_22222222'])),
    ).rejects.toThrow('MAX_PHOTOS_EXCEEDED')
  })

  it('reuses the same job after an observable Modal dispatch failure', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.events.create, createEventArgs())
    const first = await t.mutation(api.uploads.confirm, confirmArgs())
    await t.mutation(api.processing.markDispatchFailed, {
      serviceSecret,
      eventPublicId: 'evt_1234abcd',
      jobPublicId: first.jobId,
      sanitizedError: 'Modal did not accept the processing request',
      now: 1_700_000_101,
    })

    const retry = await t.mutation(api.uploads.confirm, {
      ...confirmArgs(),
      jobPublicId: 'job_2',
    })

    expect(retry).toEqual({ jobId: 'job_1', shouldDispatch: true })
    const jobs = await t.run(async (ctx) => await ctx.db.query('processingJobs').collect())
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ status: 'pending', attempts: 2 })
  })

  it('looks up an active event by opaque invite token without exposing _id', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.events.create, createEventArgs())

    const event = await t.query(api.events.lookupByInvite, {
      serviceSecret,
      inviteToken: '0123456789abcdef0123456789abcdef',
      now: 1_700_000_100,
    })

    expect(event).toEqual({
      eventId: 'evt_1234abcd',
      name: 'Fixture Event',
      status: 'processing',
    })
    expect(event).not.toHaveProperty('_id')
  })
})
