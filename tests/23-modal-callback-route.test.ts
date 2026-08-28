import { beforeEach, describe, expect, it, vi } from 'vitest'

const { client, createConvexClientMock } = vi.hoisted(() => {
  const client = { mutation: vi.fn() }
  return { client, createConvexClientMock: vi.fn(() => client) }
})

vi.mock('../apps/api/src/lib/convex', () => ({
  createConvexClient: createConvexClientMock,
  hasConvexError: (error: unknown, code: string) => String(error).includes(code),
}))

import app, { type Env } from '../apps/api/src/index'

function testEnv(): Env {
  return {
    PHOTOS: {} as R2Bucket,
    R2_ENDPOINT: '',
    R2_BUCKET: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) } as unknown as RateLimit,
    LOG_LEVEL: 'error',
    SENTRY_DSN: '',
    MODAL_TOKEN: '',
    MODAL_CALLBACK_TOKEN: 'callback-secret',
    MODAL_WEBHOOK_URL: '',
    MODAL_CANCEL_URL: '',
    MODAL_EMBEDDING_URL: '',
    MATCH_THRESHOLD: '0.6',
    CONVEX_URL: 'https://convex.example.test',
    CONVEX_SERVICE_SECRET: 'worker-secret',
  }
}

function callbackBody(faceCount = 1) {
  return {
    status: 'success',
    jobId: 'job_1',
    eventId: 'evt_1234abcd',
    attempt: 1,
    final: false,
    photos: [
      {
        photoId: 'photo_1234abcd',
        thumbnail200Key: 'events/evt_1234abcd/thumbs/200/photo_1234abcd.jpg',
        thumbnail800Key: 'events/evt_1234abcd/thumbs/800/photo_1234abcd.jpg',
        width: 1200,
        height: 800,
      },
    ],
    faces: Array.from({ length: faceCount }, (_, index) => ({
      faceId: `face_photo_1234abcd_${index}`,
      photoId: 'photo_1234abcd',
      bbox: { x: 1, y: 2, width: 3, height: 4 },
      confidence: 0.99,
      clusterId: null,
      embedding: [1, ...Array<number>(511).fill(0)],
    })),
  }
}

function callbackRequest(body: unknown, token = 'callback-secret'): Request {
  return new Request('https://api.test/internal/modal/results', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('private Modal callback', () => {
  beforeEach(() => {
    client.mutation.mockReset().mockResolvedValue({
      accepted: true,
      duplicate: false,
      completed: false,
    })
  })

  it('authenticates before accepting or parsing biometric results', async () => {
    const response = await app.fetch(callbackRequest(callbackBody(), 'wrong'), testEnv(), {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext)

    expect(response.status).toBe(401)
    expect(client.mutation).not.toHaveBeenCalled()
  })

  it('rejects callback batches containing more than 25 faces', async () => {
    const response = await app.fetch(callbackRequest(callbackBody(26)), testEnv(), {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext)

    expect(response.status).toBe(400)
    expect(client.mutation).not.toHaveBeenCalled()
  })

  it('validates and forwards a bounded result batch to Convex', async () => {
    const response = await app.fetch(callbackRequest(callbackBody()), testEnv(), {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext)

    expect(response.status).toBe(200)
    expect(client.mutation.mock.calls[0][1]).toMatchObject({
      serviceSecret: 'worker-secret',
      eventPublicId: 'evt_1234abcd',
      jobPublicId: 'job_1',
      attempt: 1,
      final: false,
    })
    expect(client.mutation.mock.calls[0][1].faces).toHaveLength(1)
  })

  it.each(['EVENT_NOT_FOUND', 'JOB_NOT_FOUND', 'STALE_JOB', 'EVENT_DELETING'])(
    'rejects %s callbacks without logging embeddings',
    async (errorCode) => {
      client.mutation.mockRejectedValue(new Error(errorCode))
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const response = await app.fetch(callbackRequest(callbackBody()), testEnv(), {
        waitUntil: vi.fn(),
      } as unknown as ExecutionContext)

      expect(response.status).toBe(409)
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain('embedding')
      consoleError.mockRestore()
    },
  )

  it('does not attach a persistence exception or callback body to logs', async () => {
    client.mutation.mockRejectedValue(new Error('database failure with embedding payload'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await app.fetch(callbackRequest(callbackBody()), testEnv(), {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext)

    expect(response.status).toBe(500)
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('embedding')
    consoleError.mockRestore()
  })
})
