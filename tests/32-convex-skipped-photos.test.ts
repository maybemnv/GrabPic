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
const eventId = 'evt_1234abcd'
const processed = 'photo_1234abcd'
const broken = 'photo_5678abcd'

async function twoPhotoJob(t: ReturnType<typeof convexTest>) {
  await t.mutation(api.events.create, {
    serviceSecret,
    publicId: eventId,
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
  })
  await t.mutation(api.uploads.confirm, {
    serviceSecret,
    eventPublicId: eventId,
    organizerTokenHash: 'a'.repeat(64),
    jobPublicId: 'job_1',
    now: 1_700_000_100,
    photos: [processed, broken].map((publicId) => ({
      publicId,
      originalKey: `events/${eventId}/${publicId}.jpg`,
      fileSize: 1024,
    })),
  })
  await t.mutation(api.processing.markAccepted, {
    serviceSecret,
    eventPublicId: eventId,
    jobPublicId: 'job_1',
    attempt: 1,
    modalJobId: 'job_1',
    now: 1_700_000_101,
  })
}

const finalArgs = (skippedPhotoIds?: string[]) => ({
  serviceSecret,
  eventPublicId: eventId,
  jobPublicId: 'job_1',
  attempt: 1,
  final: true,
  now: 1_700_000_200,
  ...(skippedPhotoIds ? { skippedPhotoIds } : {}),
  photos: [
    {
      publicId: processed,
      thumbnail200Key: `events/${eventId}/thumbs/200/${processed}.jpg`,
      thumbnail800Key: `events/${eventId}/thumbs/800/${processed}.jpg`,
      width: 1200,
      height: 800,
    },
  ],
  faces: [],
})

describe('Convex skipped photo reporting', () => {
  beforeEach(() => {
    process.env.CONVEX_SERVICE_SECRET = serviceSecret
  })

  it('rejects a final callback that leaves a photo unaccounted for', async () => {
    const t = convexTest(schema, modules)
    await twoPhotoJob(t)
    await expect(t.mutation(api.processing.persistResults, finalArgs())).rejects.toThrow(
      'INCOMPLETE_JOB',
    )
  })

  it('completes the event and marks the skipped photo failed', async () => {
    const t = convexTest(schema, modules)
    await twoPhotoJob(t)
    await t.mutation(api.processing.persistResults, finalArgs([broken]))

    const state = await t.run(async (ctx) => ({
      event: await ctx.db.query('events').first(),
      photos: await ctx.db.query('photos').collect(),
    }))
    expect(state.event?.status).toBe('ready')
    const byId = Object.fromEntries(state.photos.map((p) => [p.publicId, p.processingState]))
    expect(byId).toEqual({ [processed]: 'processed', [broken]: 'failed' })
  })

  it('rejects skipped ids that are foreign or already processed', async () => {
    const t = convexTest(schema, modules)
    await twoPhotoJob(t)
    await expect(
      t.mutation(api.processing.persistResults, finalArgs(['photo_deadbeef'])),
    ).rejects.toThrow('PHOTO_NOT_IN_JOB')
    await expect(t.mutation(api.processing.persistResults, finalArgs([processed]))).rejects.toThrow(
      'PHOTO_NOT_IN_JOB',
    )
  })
})
