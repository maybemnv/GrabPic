import { describe, expect, it, vi } from 'vitest'
import { cleanupEventResources } from '../apps/api/src/lib/event-cleanup'

function state() {
  return {
    eventPublicId: 'evt_1234abcd',
    photoCount: 1,
    storageBytes: 1024,
    objectKeys: [
      'events/evt_1234abcd/photo_1234abcd.jpg',
      'events/evt_1234abcd/thumbs/200/photo_1234abcd.jpg',
      'events/evt_1234abcd/thumbs/800/photo_1234abcd.jpg',
    ],
    modalJobId: 'modal_1',
  }
}

describe('Convex external cleanup', () => {
  it('records cancellation failure and leaves R2 and Convex rows intact', async () => {
    const client = { query: vi.fn(async () => state()), mutation: vi.fn() }
    const bucket = { delete: vi.fn(), list: vi.fn() }

    const result = await cleanupEventResources({
      client,
      serviceSecret: 'worker-secret',
      bucket,
      eventId: 'evt_1234abcd',
      cancelModalJob: vi.fn(async () => {
        throw new Error('cancel failed')
      }),
    })

    expect(result).toMatchObject({ deleted: false, objectsDeleted: 0 })
    expect(bucket.delete).not.toHaveBeenCalled()
    expect(client.mutation).toHaveBeenCalledOnce()
    expect(client.mutation.mock.calls[0][1]).toMatchObject({
      eventPublicId: 'evt_1234abcd',
      sanitizedError: 'Modal cancellation failed',
    })
  })

  it('records partial R2 failure and retries all assets before purging', async () => {
    const failedKey = 'events/evt_1234abcd/thumbs/200/photo_1234abcd.jpg'
    const partialState = {
      ...state(),
      objectKeys: [
        ...Array.from({ length: 1000 }, (_, index) => `events/evt_1234abcd/${index}.jpg`),
        failedKey,
      ],
    }
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(partialState)
        .mockResolvedValueOnce({ ...partialState, modalJobId: undefined }),
      mutation: vi
        .fn()
        .mockResolvedValueOnce({ recorded: true })
        .mockResolvedValueOnce({ recorded: true })
        .mockResolvedValueOnce({ deletedRecords: 2, eventDeleted: false })
        .mockResolvedValueOnce({ deletedRecords: 2, eventDeleted: true }),
    }
    const firstBucket = {
      delete: vi.fn(async (keys: string | string[]) => {
        if ((Array.isArray(keys) ? keys : [keys]).includes(failedKey)) {
          throw new Error('R2 unavailable')
        }
      }),
      list: vi.fn(async () => ({ objects: [], truncated: false })),
    }

    const failed = await cleanupEventResources({
      client,
      serviceSecret: 'worker-secret',
      bucket: firstBucket,
      eventId: 'evt_1234abcd',
      cancelModalJob: vi.fn(async () => undefined),
    })
    expect(failed).toMatchObject({
      deleted: false,
      failedKeys: [failedKey],
    })

    const retryBucket = {
      delete: vi.fn(async () => undefined),
      list: vi.fn(async () => ({ objects: [], truncated: false })),
    }
    const retried = await cleanupEventResources({
      client,
      serviceSecret: 'worker-secret',
      bucket: retryBucket,
      eventId: 'evt_1234abcd',
      cancelModalJob: vi.fn(async () => undefined),
    })
    expect(retried).toMatchObject({ deleted: true, objectsDeleted: 1001 })
    expect(retryBucket.delete).toHaveBeenCalledTimes(2)
  })

  it('sweeps unconfirmed originals and callback-failed thumbnails before purge', async () => {
    const orphanOriginal = 'events/evt_1234abcd/photo_unconfirmed.jpg'
    const orphanThumbnail = 'events/evt_1234abcd/thumbs/800/photo_failed.jpg'
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(state())
        .mockResolvedValueOnce({ ...state(), modalJobId: undefined }),
      mutation: vi
        .fn()
        .mockResolvedValueOnce({ recorded: true })
        .mockResolvedValueOnce({ deletedRecords: 1, eventDeleted: true }),
    }
    const bucket = {
      list: vi.fn(async ({ cursor }: { cursor?: string }) =>
        cursor
          ? { objects: [{ key: orphanThumbnail }], truncated: false }
          : { objects: [{ key: orphanOriginal }], truncated: true, cursor: 'page-2' },
      ),
      delete: vi.fn(async () => undefined),
    }

    const result = await cleanupEventResources({
      client,
      serviceSecret: 'worker-secret',
      bucket,
      eventId: 'evt_1234abcd',
      cancelModalJob: vi.fn(async () => undefined),
    })

    expect(result?.deleted).toBe(true)
    expect(bucket.list).toHaveBeenCalledWith({ prefix: 'events/evt_1234abcd/' })
    expect(bucket.list).toHaveBeenCalledWith({ prefix: 'events/evt_1234abcd/', cursor: 'page-2' })
    expect(bucket.delete).toHaveBeenCalledWith(
      expect.arrayContaining([orphanOriginal, orphanThumbnail]),
    )
  })
})
