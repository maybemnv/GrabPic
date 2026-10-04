import { beforeEach, describe, expect, it, vi } from 'vitest'

const { client, createConvexClientMock, queueSend } = vi.hoisted(() => ({
  client: { query: vi.fn(), mutation: vi.fn() },
  createConvexClientMock: vi.fn(),
  queueSend: vi.fn(),
}))
createConvexClientMock.mockImplementation(() => client)

vi.mock('../apps/api/src/lib/convex', () => ({
  createConvexClient: createConvexClientMock,
  hasConvexError: (error: unknown, code: string) => String(error).includes(code),
}))

import app, { type Env } from '../apps/api/src/index'

function testEnv(): Env {
  return {
    PHOTOS: { head: vi.fn(async () => ({ size: 1024 })), delete: vi.fn() } as unknown as R2Bucket,
    R2_ENDPOINT: 'https://r2.example.test',
    R2_BUCKET: 'grabpic-test',
    R2_ACCESS_KEY_ID: 'access',
    R2_SECRET_ACCESS_KEY: 'secret',
    RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) } as unknown as RateLimit,
    LOG_LEVEL: 'error',
    SENTRY_DSN: '',
    PROCESSOR_TOKEN: 'processor-token',
    PROCESSOR_CALLBACK_TOKEN: '',
    PROCESSOR_WEBHOOK_URL: 'https://processor.test/process',
    PROCESSOR_CANCEL_URL: 'https://processor.test/cancel',
    PROCESSOR_EMBEDDING_URL: '',
    PROCESSING_QUEUE: { send: queueSend } as unknown as Queue,
    MATCH_THRESHOLD: '0.6',
    CONVEX_URL: 'https://convex.example.test',
    CONVEX_SERVICE_SECRET: 'worker-secret',
  }
}

async function confirm(env = testEnv()) {
  return app.fetch(
    new Request('https://api.test/events/evt_1/upload/confirm', {
      method: 'POST',
      headers: { Authorization: 'Bearer organizer-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIds: ['photo_1234abcd'] }),
    }),
    env,
    { waitUntil: vi.fn() } as unknown as ExecutionContext,
  )
}

describe('queued upload confirmation', () => {
  beforeEach(() => {
    client.query.mockReset().mockResolvedValue({
      status: 'processing',
      photoCount: 0,
      maxPhotos: 100,
      hasProcessingJob: false,
    })
    client.mutation.mockReset()
    queueSend.mockReset().mockResolvedValue(undefined)
  })

  it('returns 202 only after queue send and Convex acceptance', async () => {
    client.mutation
      .mockResolvedValueOnce({ jobId: 'job_1', attempt: 1, shouldDispatch: true })
      .mockResolvedValueOnce({ accepted: true })
    const response = await confirm()
    expect(response.status).toBe(202)
    expect(queueSend).toHaveBeenCalledWith({
      job_id: 'job_1',
      event_id: 'evt_1',
      attempt: 1,
    })
    expect(client.mutation.mock.calls[1][1]).toMatchObject({ modalJobId: 'job_1' })
  })

  it('retains a retryable job when the queue rejects a send', async () => {
    client.mutation
      .mockResolvedValueOnce({ jobId: 'job_1', attempt: 1, shouldDispatch: true })
      .mockResolvedValueOnce({ recorded: true })
    queueSend.mockRejectedValueOnce(new Error('queue unavailable'))
    const response = await confirm()
    expect(response.status).toBe(502)
    expect(client.mutation.mock.calls[1][1]).toMatchObject({ jobPublicId: 'job_1' })
  })

  it('does not enqueue a duplicate accepted confirmation', async () => {
    client.mutation.mockResolvedValueOnce({
      jobId: 'job_1',
      attempt: 1,
      modalJobId: 'job_1',
      shouldDispatch: false,
    })
    expect((await confirm()).status).toBe(202)
    expect(queueSend).not.toHaveBeenCalled()
  })

  it('does not touch R2 or queue for the wrong organizer', async () => {
    client.query.mockRejectedValueOnce(new Error('UNAUTHORIZED'))
    const env = testEnv()
    expect((await confirm(env)).status).toBe(401)
    expect(env.PHOTOS.head).not.toHaveBeenCalled()
    expect(queueSend).not.toHaveBeenCalled()
  })

  it('retries a previously failed confirmation with a new attempt', async () => {
    client.query.mockResolvedValueOnce({
      status: 'failed',
      photoCount: 1,
      maxPhotos: 100,
      hasProcessingJob: true,
    })
    client.mutation
      .mockResolvedValueOnce({ jobId: 'job_1', attempt: 2, shouldDispatch: true })
      .mockResolvedValueOnce({ accepted: true })
    expect((await confirm()).status).toBe(202)
    expect(queueSend.mock.calls[0][0]).toMatchObject({ attempt: 2 })
  })

  it('leaves a queued message harmless when deletion wins the acceptance race', async () => {
    client.mutation
      .mockResolvedValueOnce({ jobId: 'job_1', attempt: 1, shouldDispatch: true })
      .mockRejectedValueOnce(new Error('EVENT_DELETING'))
    expect((await confirm()).status).toBe(409)
    expect(queueSend).toHaveBeenCalledOnce()
    // Queue consumer rechecks Convex and acknowledges a deleted job without contacting OCI.
  })
})
