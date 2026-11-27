// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../apps/api/convex/_generated/api'
import schema from '../apps/api/convex/schema'
import { cleanupEventResources, cleanupOrphanedPhotos } from '../apps/api/src/lib/event-cleanup'

const modules = import.meta.glob([
  '../apps/api/convex/**/*.ts',
  '../apps/api/convex/**/*.js',
  '!../apps/api/convex/**/*.d.ts',
])
const serviceSecret = 'worker-secret'

describe('orphan photo reconciliation', () => {
  beforeEach(() => {
    process.env.CONVEX_SERVICE_SECRET = serviceSecret
  })

  it('removes a late PUT after event purge and preserves active unconfirmed objects', async () => {
    const t = convexTest(schema, modules)
    await t.run((ctx) =>
      ctx.db.insert('events', {
        publicId: 'evt_active',
        name: 'Active',
        passcode: '123456',
        inviteToken: 'invite',
        organizerTokenHash: 'a'.repeat(64),
        createdAt: 1,
        expiresAt: 9999999999,
        status: 'processing',
        photoCount: 0,
        faceCount: 0,
        organizerEmail: '',
        organizerName: '',
        maxPhotos: 100,
        tier: 'free',
        matchThreshold: 0.6,
        clusteringEps: 0.4,
        deletionAttempts: 0,
      }),
    )
    const keys = new Set(['events/evt_active/unconfirmed.jpg'])
    const bucket = {
      list: vi.fn(async () => ({ objects: [...keys].map((key) => ({ key })), truncated: false })),
      delete: vi.fn(async (values: string | string[]) => {
        for (const key of typeof values === 'string' ? [values] : values) keys.delete(key)
      }),
    }
    const options = { client: t, serviceSecret, bucket }
    await cleanupOrphanedPhotos(options)
    expect(keys.size).toBe(1)
    await t.mutation(api.deletion.beginOrganizer, {
      serviceSecret,
      eventPublicId: 'evt_active',
      organizerTokenHash: 'a'.repeat(64),
      now: 2,
    })
    expect(
      await cleanupEventResources({
        ...options,
        eventId: 'evt_active',
        cancelModalJob: async () => undefined,
      }),
    ).toMatchObject({ deleted: true })
    expect(keys.size).toBe(0)
    keys.add('events/evt_active/late-put.jpg')
    await cleanupOrphanedPhotos(options)
    expect(keys.size).toBe(0)
  })

  it('bounds a run to one page and resumes its cursor before restarting the scan', async () => {
    const t = convexTest(schema, modules)
    const bucket = {
      list: vi
        .fn()
        .mockResolvedValueOnce({
          objects: [{ key: 'events/evt_missing/a.jpg' }],
          truncated: true,
          cursor: 'next',
        })
        .mockResolvedValueOnce({ objects: [{ key: 'events/evt_missing/b.jpg' }], truncated: false })
        .mockResolvedValueOnce({ objects: [], truncated: false }),
      delete: vi.fn(async () => undefined),
    }
    for (let i = 0; i < 3; i++) await cleanupOrphanedPhotos({ client: t, serviceSecret, bucket })
    expect(bucket.list.mock.calls).toEqual([
      [{ prefix: 'events/', limit: 100 }],
      [{ prefix: 'events/', limit: 100, cursor: 'next' }],
      [{ prefix: 'events/', limit: 100 }],
    ])
  })

  it.each(['list', 'query', 'delete'])(
    'retries the same page after %s failure',
    async (failure) => {
      const t = convexTest(schema, modules)
      const client = { query: vi.fn(t.query), mutation: t.mutation }
      const bucket = {
        list: vi.fn(async () => ({
          objects: [{ key: 'events/evt_missing/a.jpg' }],
          truncated: true,
          cursor: 'next',
        })),
        delete: vi.fn(async () => undefined),
      }
      if (failure === 'list') bucket.list.mockRejectedValueOnce(new Error('unavailable'))
      if (failure === 'query')
        client.query.mockImplementationOnce(t.query).mockRejectedValueOnce(new Error('unavailable'))
      if (failure === 'delete') bucket.delete.mockRejectedValueOnce(new Error('unavailable'))
      await expect(cleanupOrphanedPhotos({ client, serviceSecret, bucket })).rejects.toThrow()
      expect(await t.query(api.deletion.getOrphanScanCursor, { serviceSecret })).toBeNull()
      if (failure !== 'delete') expect(bucket.delete).not.toHaveBeenCalled()
      await cleanupOrphanedPhotos({ client, serviceSecret, bucket })
      expect(await t.query(api.deletion.getOrphanScanCursor, { serviceSecret })).toBe('next')
    },
  )

  it('requires the service secret for existence and cursor access', async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.query(api.deletion.getOrphanScanCursor, { serviceSecret: 'wrong' }),
    ).rejects.toThrow()
    await expect(
      t.query(api.deletion.findMissingEvents, {
        serviceSecret: 'wrong',
        eventPublicIds: ['evt_missing'],
      }),
    ).rejects.toThrow()
    await expect(
      t.mutation(api.deletion.advanceOrphanScan, {
        serviceSecret: 'wrong',
        expectedCursor: null,
        cursor: 'next',
      }),
    ).rejects.toThrow()
  })

  it('does not advance a stalled listing or overwrite a newer cursor', async () => {
    const t = convexTest(schema, modules)
    const bucket = {
      list: vi.fn(async () => ({ objects: [], truncated: true })),
      delete: vi.fn(async () => undefined),
    }
    await expect(cleanupOrphanedPhotos({ client: t, serviceSecret, bucket })).rejects.toThrow(
      'R2_LIST_STALLED',
    )
    await t.mutation(api.deletion.advanceOrphanScan, {
      serviceSecret,
      expectedCursor: null,
      cursor: 'newer',
    })
    await t.mutation(api.deletion.advanceOrphanScan, {
      serviceSecret,
      expectedCursor: null,
      cursor: 'stale',
    })
    expect(await t.query(api.deletion.getOrphanScanCursor, { serviceSecret })).toBe('newer')
  })
})
