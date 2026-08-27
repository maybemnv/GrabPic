import { describe, expect, it } from 'vitest'
import { buildProcessingRequest, requestSelfieEmbedding } from '../apps/api/src/lib/modal'

describe('Modal processing contract', () => {
  it('sends stable event-scoped R2 object references', () => {
    expect(
      buildProcessingRequest('evt_1', [{ id: 'photo_1', r2Key: 'events/evt_1/photo_1.jpg' }]),
    ).toEqual({
      event_id: 'evt_1',
      photos: [{ photo_id: 'photo_1', r2_key: 'events/evt_1/photo_1.jpg' }],
    })
  })

  it('rejects a failed or malformed selfie embedding response', async () => {
    await expect(
      requestSelfieEmbedding(
        'https://modal.test/embed',
        'token',
        'data:image/jpeg;base64,abc',
        async () => new Response('nope', { status: 500 }),
      ),
    ).rejects.toThrow('embedding service failed')

    await expect(
      requestSelfieEmbedding(
        'https://modal.test/embed',
        'token',
        'data:image/jpeg;base64,abc',
        async () => Response.json({ embedding: [1, 2] }),
      ),
    ).rejects.toThrow('512-dimensional')
  })
})
