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
