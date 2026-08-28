import { describe, expect, it, vi } from 'vitest'
import { cleanupExpiredEvents } from '../apps/api/src/lib/event-cleanup'

describe('expired event cleanup', () => {
  it('uses the same mark, external cleanup, and event-last purge path', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(['evt_expired'])
        .mockResolvedValueOnce({
          eventPublicId: 'evt_expired',
          photoCount: 1,
          storageBytes: 100,
          objectKeys: ['events/evt_expired/photo.jpg'],
        }),
      mutation: vi
        .fn()
        .mockResolvedValueOnce({ deleting: true })
        .mockResolvedValueOnce({ deletedRecords: 2, eventDeleted: true }),
    }
    const bucket = {
      delete: vi.fn(async () => undefined),
      list: vi.fn(async () => ({ objects: [], truncated: false })),
    }

    const result = await cleanupExpiredEvents({
      client,
      serviceSecret: 'worker-secret',
      bucket,
      cancelModalJob: vi.fn(async () => undefined),
      now: 1_700_000_000,
    })

    expect(result).toEqual({ expiredEvents: 1, deletedEvents: 1, failedEvents: [] })
    expect(bucket.delete).toHaveBeenCalledWith(['events/evt_expired/photo.jpg'])
    expect(client.mutation.mock.calls[0][1]).toMatchObject({
      eventPublicId: 'evt_expired',
      now: 1_700_000_000,
    })
    expect(client.mutation.mock.calls[1][1]).toMatchObject({ eventPublicId: 'evt_expired' })
  })
})
