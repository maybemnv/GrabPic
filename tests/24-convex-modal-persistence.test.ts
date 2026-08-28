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

function eventArgs() {
  return {
    serviceSecret,
    publicId: 'evt_1234abcd',
    name: 'Fixture Event',
    passcode: '123456',
    inviteToken: '0123456789abcdef0123456789abcdef',
    organizerTokenHash: 'a'.repeat(64),
    createdAt: 1_700_000_000,
    expiresAt: 1_800_000_000,
    organizerEmail: 'organizer@example.invalid',
    organizerName: 'Organizer',
    maxPhotos: 100,
    tier: 'free' as const,
    matchThreshold: 0.6,
    clusteringEps: 0.4,
  }
}

async function acceptedJob(t: ReturnType<typeof convexTest>) {
  await t.mutation(api.events.create, eventArgs())
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
    modalJobId: 'modal_1',
    now: 1_700_000_101,
  })
}

function resultArgs(final = false) {
  return {
    serviceSecret,
    eventPublicId: 'evt_1234abcd',
    jobPublicId: 'job_1',
    final,
    now: 1_700_000_200,
    photos: [
      {
        publicId: 'photo_1234abcd',
        thumbnail200Key: 'events/evt_1234abcd/thumbs/200/photo_1234abcd.jpg',
        thumbnail800Key: 'events/evt_1234abcd/thumbs/800/photo_1234abcd.jpg',
        width: 1200,
        height: 800,
      },
    ],
    faces: [
      {
        publicId: 'face_photo_1234abcd_0',
        photoPublicId: 'photo_1234abcd',
        bbox: { x: 1, y: 2, width: 3, height: 4 },
        confidence: 0.99,
        embedding: [1, ...Array<number>(511).fill(0)],
      },
    ],
  }
}

describe('Convex Modal result persistence', () => {
  beforeEach(() => {
    process.env.CONVEX_SERVICE_SECRET = serviceSecret
  })

  it('persists batches idempotently and marks ready only on final delivery', async () => {
    const t = convexTest(schema, modules)
    await acceptedJob(t)

    await t.mutation(api.processing.persistResults, resultArgs())
    await t.mutation(api.processing.persistResults, resultArgs())
    let state = await t.run(async (ctx) => ({
      event: await ctx.db.query('events').first(),
      photo: await ctx.db.query('photos').first(),
      faces: await ctx.db.query('faces').collect(),
      job: await ctx.db.query('processingJobs').first(),
    }))
    expect(state.event).toMatchObject({ status: 'processing', faceCount: 1 })
    expect(state.photo).toMatchObject({ processingState: 'processed', faceCount: 1 })
    expect(state.faces).toHaveLength(1)
    expect(state.job?.status).toBe('processing')

    await t.mutation(api.processing.persistResults, { ...resultArgs(true), faces: [] })
    await t.mutation(api.processing.persistResults, { ...resultArgs(true), faces: [] })
    state = await t.run(async (ctx) => ({
      event: await ctx.db.query('events').first(),
      photo: await ctx.db.query('photos').first(),
      faces: await ctx.db.query('faces').collect(),
      job: await ctx.db.query('processingJobs').first(),
    }))
    expect(state.event).toMatchObject({ status: 'ready', faceCount: 1 })
    expect(state.faces).toHaveLength(1)
    expect(state.job?.status).toBe('complete')
  })

  it('rejects a callback after deletion starts and recreates no state', async () => {
    const t = convexTest(schema, modules)
    await acceptedJob(t)
    await t.run(async (ctx) => {
      const event = await ctx.db.query('events').first()
      if (!event) throw new Error('fixture missing')
      await ctx.db.patch(event._id, { status: 'deleting' })
    })

    await expect(t.mutation(api.processing.persistResults, resultArgs())).rejects.toThrow(
      'EVENT_DELETING',
    )

    const state = await t.run(async (ctx) => ({
      event: await ctx.db.query('events').first(),
      photo: await ctx.db.query('photos').first(),
      faces: await ctx.db.query('faces').collect(),
    }))
    expect(state.event).toMatchObject({ status: 'deleting', faceCount: 0 })
    expect(state.photo).toMatchObject({ processingState: 'pending', faceCount: 0 })
    expect(state.faces).toEqual([])
  })

  it('rejects faces that do not belong to a known job photo', async () => {
    const t = convexTest(schema, modules)
    await acceptedJob(t)

    await expect(
      t.mutation(api.processing.persistResults, {
        ...resultArgs(),
        faces: [{ ...resultArgs().faces[0], photoPublicId: 'photo_ffffffff' }],
      }),
    ).rejects.toThrow('PHOTO_NOT_IN_JOB')
  })

  it('rejects wrong-event and stale-job payloads', async () => {
    const t = convexTest(schema, modules)
    await acceptedJob(t)

    await expect(
      t.mutation(api.processing.persistResults, {
        ...resultArgs(),
        eventPublicId: 'evt_ffffffff',
      }),
    ).rejects.toThrow('EVENT_NOT_FOUND')

    await t.run(async (ctx) => {
      const job = await ctx.db.query('processingJobs').first()
      if (!job) throw new Error('fixture missing')
      await ctx.db.patch(job._id, { status: 'cancelled' })
    })
    await expect(t.mutation(api.processing.persistResults, resultArgs())).rejects.toThrow(
      'STALE_JOB',
    )
  })

  it('keeps a failed processing job retryable with the same job and photos', async () => {
    const t = convexTest(schema, modules)
    await acceptedJob(t)
    await t.mutation(api.processing.markProcessingFailed, {
      serviceSecret,
      eventPublicId: 'evt_1234abcd',
      jobPublicId: 'job_1',
      sanitizedError: 'Modal processing failed',
      now: 1_700_000_200,
    })

    const retry = await t.mutation(api.uploads.confirm, {
      serviceSecret,
      eventPublicId: 'evt_1234abcd',
      organizerTokenHash: 'a'.repeat(64),
      jobPublicId: 'job_2',
      now: 1_700_000_300,
      photos: [
        {
          publicId: 'photo_1234abcd',
          originalKey: 'events/evt_1234abcd/photo_1234abcd.jpg',
          fileSize: 1024,
        },
      ],
    })

    expect(retry).toEqual({ jobId: 'job_1', shouldDispatch: true })
    const state = await t.run(async (ctx) => ({
      event: await ctx.db.query('events').first(),
      jobs: await ctx.db.query('processingJobs').collect(),
      photos: await ctx.db.query('photos').collect(),
    }))
    expect(state.event?.status).toBe('processing')
    expect(state.jobs).toHaveLength(1)
    expect(state.photos).toHaveLength(1)
  })
})
