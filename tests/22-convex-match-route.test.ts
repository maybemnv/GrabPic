import { beforeEach, describe, expect, it, vi } from 'vitest'

const { client, createConvexClientMock, requestSelfieEmbeddingMock, createSignedR2UrlMock } =
  vi.hoisted(() => {
    const client = { query: vi.fn(), action: vi.fn() }
    return {
      client,
      createConvexClientMock: vi.fn(() => client),
      requestSelfieEmbeddingMock: vi.fn(),
      createSignedR2UrlMock: vi.fn(async (_env, key: string) => `https://signed.test/${key}`),
    }
  })

vi.mock('../apps/api/src/lib/convex', () => ({
  createConvexClient: createConvexClientMock,
  hasConvexError: (error: unknown, code: string) => String(error).includes(code),
}))
vi.mock('../apps/api/src/lib/modal', () => ({
  buildProcessingRequest: vi.fn(),
  requestProcessingAcceptance: vi.fn(),
  requestSelfieEmbedding: requestSelfieEmbeddingMock,
}))
vi.mock('../apps/api/src/lib/r2', () => ({ createSignedR2Url: createSignedR2UrlMock }))

import app, { type Env } from '../apps/api/src/index'

function testEnv(): Env {
  return {
    PHOTOS: {} as R2Bucket,
    R2_ENDPOINT: 'https://r2.example.test',
    R2_BUCKET: 'grabpic-test',
    R2_ACCESS_KEY_ID: 'access',
    R2_SECRET_ACCESS_KEY: 'secret',
    RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) } as unknown as RateLimit,
    LOG_LEVEL: 'error',
    SENTRY_DSN: '',
    MODAL_TOKEN: 'modal-token',
    MODAL_CALLBACK_TOKEN: '',
    MODAL_WEBHOOK_URL: '',
    MODAL_CANCEL_URL: '',
    MODAL_EMBEDDING_URL: 'https://modal.test/embed',
    MATCH_THRESHOLD: '0.6',
    CONVEX_URL: 'https://convex.example.test',
    CONVEX_SERVICE_SECRET: 'worker-secret',
  }
}

function matchRequest(passcode = '111111'): Request {
  return new Request('https://api.test/events/evt_11111111/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      passcode,
      selfieData: `data:image/jpeg;base64,${'a'.repeat(64)}`,
    }),
  })
}

describe('Convex match route', () => {
  beforeEach(() => {
    client.query.mockReset().mockResolvedValue({ ready: true })
    client.action.mockReset().mockResolvedValue({
      threshold: 0.6,
      matches: [
        {
          photoId: 'photo_11111111',
          originalKey: 'events/evt_11111111/photo_11111111.jpg',
          thumbnail800Key: 'events/evt_11111111/thumbs/800/photo_11111111.jpg',
          width: 1200,
          height: 800,
          bbox: { x: 1, y: 2, width: 3, height: 4 },
          score: 0.9,
        },
      ],
    })
    requestSelfieEmbeddingMock
      .mockReset()
      .mockResolvedValue(new Float32Array([1, ...Array<number>(511).fill(0)]))
    createSignedR2UrlMock.mockClear()
  })

  it('authorizes before Modal and returns signed Convex match assets', async () => {
    const response = await app.fetch(matchRequest(), testEnv(), {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext)

    expect(response.status).toBe(200)
    expect(client.query.mock.invocationCallOrder[0]).toBeLessThan(
      requestSelfieEmbeddingMock.mock.invocationCallOrder[0],
    )
    expect(client.action.mock.calls[0][1]).toMatchObject({
      eventPublicId: 'evt_11111111',
      passcode: '111111',
      serviceSecret: 'worker-secret',
    })
    expect(client.action.mock.calls[0][1]).not.toHaveProperty('clientId')
    expect(client.action.mock.calls[0][1].embedding).toHaveLength(512)
    expect(await response.json()).toMatchObject({
      totalMatches: 1,
      matches: [{ photoId: 'photo_11111111', similarity: 0.9 }],
    })
    expect(createSignedR2UrlMock).toHaveBeenCalledTimes(2)
  })

  it('does not send the selfie to Modal when attendee access fails', async () => {
    client.query.mockRejectedValue(new Error('UNAUTHORIZED'))

    const response = await app.fetch(matchRequest('222222'), testEnv(), {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext)

    expect(response.status).toBe(401)
    expect(requestSelfieEmbeddingMock).not.toHaveBeenCalled()
    expect(client.action).not.toHaveBeenCalled()
  })
})
