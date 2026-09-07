import { describe, expect, it, vi } from 'vitest'

const { convexClient, createConvexClientMock } = vi.hoisted(() => {
  const convexClient = { query: vi.fn(), mutation: vi.fn() }
  return {
    convexClient,
    createConvexClientMock: vi.fn(() => convexClient),
  }
})

vi.mock('../apps/api/src/lib/convex', () => ({
  createConvexClient: createConvexClientMock,
  hasConvexError: (error: unknown, code: string) => String(error).includes(code),
}))

import app, { type Env } from '../apps/api/src/index'
import { MAX_UPLOAD_BYTES } from '../apps/api/src/lib/upload'

function testEnv(): Env {
  return {
    PHOTOS: { head: vi.fn(), delete: vi.fn() } as unknown as R2Bucket,
    R2_ENDPOINT: 'https://r2.example.test',
    R2_BUCKET: 'grabpic-test',
    R2_ACCESS_KEY_ID: 'access',
    R2_SECRET_ACCESS_KEY: 'secret',
    RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) } as unknown as RateLimit,
    LOG_LEVEL: 'error',
    SENTRY_DSN: '',
    MODAL_TOKEN: '',
    MODAL_CALLBACK_TOKEN: '',
    MODAL_WEBHOOK_URL: '',
    MODAL_CANCEL_URL: '',
    MODAL_EMBEDDING_URL: '',
    MATCH_THRESHOLD: '0.6',
    CONVEX_URL: 'https://convex.example.test',
    CONVEX_SERVICE_SECRET: 'worker-secret',
  }
}

describe('organizer route authorization', () => {
  it('rejects attendee access to organizer event, upload, delete, and QR routes', async () => {
    convexClient.query.mockReset().mockResolvedValueOnce(null).mockResolvedValue({
      status: 'processing',
      photoCount: 0,
      maxPhotos: 100,
      hasProcessingJob: false,
    })

    const requests = [
      new Request('https://api.test/events/evt_1'),
      new Request('https://api.test/events/evt_1', { method: 'DELETE' }),
      new Request('https://api.test/events/evt_1/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: [{ filename: 'photo.jpg', size: 10, type: 'image/jpeg' }] }),
      }),
      new Request('https://api.test/qr/evt_1'),
    ]

    for (const request of requests) {
      const response = await app.fetch(request, testEnv(), {
        waitUntil: vi.fn(),
      } as unknown as ExecutionContext)
      expect(response.status).toBe(401)
    }
  })

  it('checks the global upload bucket and actual R2 size before accepting a batch', async () => {
    convexClient.query.mockReset().mockResolvedValueOnce(null).mockResolvedValue({
      status: 'processing',
      photoCount: 0,
      maxPhotos: 100,
      hasProcessingJob: false,
    })
    const limit = vi.fn(async () => ({ success: true }))
    const head = vi.fn(async () => ({ size: MAX_UPLOAD_BYTES + 1 }))
    const remove = vi.fn(async () => undefined)
    const env = testEnv()
    env.RATE_LIMITER = { limit } as unknown as RateLimit
    env.PHOTOS = { head, delete: remove } as unknown as R2Bucket

    const missingEventResponse = await app.fetch(
      new Request('https://api.test/events/missing/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '203.0.113.4',
          Authorization: 'Bearer organizer-secret',
        },
        body: JSON.stringify({ photos: [{ filename: 'photo.jpg', size: 10, type: 'image/jpeg' }] }),
      }),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    )
    expect(missingEventResponse.status).toBe(404)

    const response = await app.fetch(
      new Request('https://api.test/events/evt_1/upload/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '203.0.113.4',
          Authorization: 'Bearer organizer-secret',
        },
        body: JSON.stringify({ photoIds: ['photo_1234abcd'] }),
      }),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    )

    expect(response.status).toBe(413)
    expect(remove).toHaveBeenCalledWith('events/evt_1/photo_1234abcd.jpg')
    expect(limit).toHaveBeenCalledWith({ key: 'upload-confirmation::203.0.113.4' })
  })
})
