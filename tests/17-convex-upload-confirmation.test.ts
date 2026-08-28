import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { client, createConvexClientMock } = vi.hoisted(() => {
  const client = {
    query: vi.fn(),
    mutation: vi.fn(),
  }
  return {
    client,
    createConvexClientMock: vi.fn(() => client),
  }
})

vi.mock('../apps/api/src/lib/convex', () => ({
  createConvexClient: createConvexClientMock,
  hasConvexError: (error: unknown, code: string) => String(error).includes(code),
}))

import app, { type Env } from '../apps/api/src/index'

function testEnv(): Env {
  return {
    PHOTOS: {
      head: vi.fn(async () => ({ size: 1024 })),
      delete: vi.fn(),
    } as unknown as R2Bucket,
    R2_ENDPOINT: 'https://r2.example.test',
    R2_BUCKET: 'grabpic-test',
    R2_ACCESS_KEY_ID: 'access',
    R2_SECRET_ACCESS_KEY: 'secret',
    RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) } as unknown as RateLimit,
    LOG_LEVEL: 'error',
    SENTRY_DSN: '',
    MODAL_TOKEN: 'modal-token',
    MODAL_CALLBACK_TOKEN: '',
    MODAL_WEBHOOK_URL: 'https://modal.test/process',
    MODAL_CANCEL_URL: 'https://modal.test/cancel',
    MODAL_EMBEDDING_URL: '',
    MATCH_THRESHOLD: '0.6',
    CONVEX_URL: 'https://convex.example.test',
    CONVEX_SERVICE_SECRET: 'worker-secret',
  }
}

function confirmationRequest(): Request {
  return new Request('https://api.test/events/evt_1/upload/confirm', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer organizer-secret',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ photoIds: ['photo_1234abcd'] }),
  })
}

describe('Convex upload confirmation', () => {
  beforeEach(() => {
    client.query.mockReset().mockResolvedValue({
      status: 'processing',
      photoCount: 0,
      maxPhotos: 100,
      hasProcessingJob: false,
    })
    client.mutation.mockReset()
    createConvexClientMock.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns 202 only after Modal accepts and returns a real job identifier', async () => {
    client.mutation
      .mockResolvedValueOnce({ jobId: 'job_1', shouldDispatch: true })
      .mockResolvedValueOnce({ accepted: true })
    const modalFetch = vi.fn(async () => Response.json({ job_id: 'modal_1' }, { status: 202 }))
    vi.stubGlobal('fetch', modalFetch)

    const response = await app.fetch(confirmationRequest(), testEnv(), {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext)

    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({ status: 'processing', jobId: 'job_1' })
    expect(modalFetch).toHaveBeenCalledOnce()
    expect(client.mutation).toHaveBeenCalledTimes(2)
    expect(client.mutation.mock.calls[1][1]).toMatchObject({
      eventPublicId: 'evt_1',
      jobPublicId: 'job_1',
      modalJobId: 'modal_1',
    })
  })

  it('returns 502 and retains a retryable job when Modal rejects the request', async () => {
    client.mutation
      .mockResolvedValueOnce({ jobId: 'job_1', shouldDispatch: true })
      .mockResolvedValueOnce({ recorded: true })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unavailable', { status: 503 })),
    )

    const response = await app.fetch(confirmationRequest(), testEnv(), {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext)

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Processing service unavailable',
      code: 'PROCESSING_TRIGGER_FAILED',
    })
    expect(client.mutation).toHaveBeenCalledTimes(2)
    expect(client.mutation.mock.calls[1][1]).toMatchObject({
      eventPublicId: 'evt_1',
      jobPublicId: 'job_1',
    })
  })

  it('does not dispatch Modal again for an already accepted confirmation', async () => {
    client.mutation.mockResolvedValueOnce({
      jobId: 'job_1',
      modalJobId: 'modal_1',
      shouldDispatch: false,
    })
    const modalFetch = vi.fn()
    vi.stubGlobal('fetch', modalFetch)

    const response = await app.fetch(confirmationRequest(), testEnv(), {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext)

    expect(response.status).toBe(202)
    expect(modalFetch).not.toHaveBeenCalled()
    expect(client.mutation).toHaveBeenCalledOnce()
  })

  it('performs no R2 operation when organizer ownership fails', async () => {
    client.query.mockRejectedValue(new Error('UNAUTHORIZED'))
    const env = testEnv()

    const response = await app.fetch(confirmationRequest(), env, {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext)

    expect(response.status).toBe(401)
    expect(env.PHOTOS.head).not.toHaveBeenCalled()
    expect(client.mutation).not.toHaveBeenCalled()
  })

  it('allows the same confirmed batch to retry after processing fails', async () => {
    client.query.mockResolvedValue({
      status: 'failed',
      photoCount: 1,
      maxPhotos: 100,
      hasProcessingJob: true,
    })
    client.mutation
      .mockResolvedValueOnce({ jobId: 'job_1', shouldDispatch: true })
      .mockResolvedValueOnce({ accepted: true })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ job_id: 'modal_retry' }, { status: 202 })),
    )

    const response = await app.fetch(confirmationRequest(), testEnv(), {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext)

    expect(response.status).toBe(202)
    expect(client.mutation).toHaveBeenCalledTimes(2)
  })
})
