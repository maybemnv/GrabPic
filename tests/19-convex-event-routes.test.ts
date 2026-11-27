import { beforeEach, describe, expect, it, vi } from 'vitest'

const { client, createConvexClientMock } = vi.hoisted(() => {
  const client = { query: vi.fn(), mutation: vi.fn() }
  return { client, createConvexClientMock: vi.fn(() => client) }
})

vi.mock('../apps/api/src/lib/convex', () => ({
  createConvexClient: createConvexClientMock,
  hasConvexError: (error: unknown, code: string) => String(error).includes(code),
}))

import app, { type Env } from '../apps/api/src/index'

function testEnv(): Env {
  return {
    PHOTOS: {
      delete: vi.fn(async () => undefined),
      list: vi.fn(async () => ({ objects: [], truncated: false })),
    } as unknown as R2Bucket,
    R2_ENDPOINT: 'https://r2.example.test',
    R2_BUCKET: 'grabpic-test',
    R2_ACCESS_KEY_ID: 'access',
    R2_SECRET_ACCESS_KEY: 'secret',
    RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) } as unknown as RateLimit,
    LOG_LEVEL: 'error',
    SENTRY_DSN: '',
    PROCESSOR_TOKEN: '',
    PROCESSOR_CALLBACK_TOKEN: '',
    PROCESSOR_WEBHOOK_URL: '',
    PROCESSOR_CANCEL_URL: '',
    PROCESSOR_EMBEDDING_URL: '',
    MATCH_THRESHOLD: '0.6',
    CONVEX_URL: 'https://convex.example.test',
    CONVEX_SERVICE_SECRET: 'worker-secret',
  }
}

describe('Convex event routes', () => {
  beforeEach(() => {
    client.query.mockReset()
    client.mutation.mockReset()
  })

  it('returns explicit CORS headers for browser preflight from approved origins', async () => {
    const response = await app.fetch(
      new Request('https://api.test/events/evt_1234abcd/upload/confirm', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://grabpic.app',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      }),
      testEnv(),
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://grabpic.app')
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })

  it('does not apply browser CORS to the private Modal callback', async () => {
    const response = await app.fetch(
      new Request('https://api.test/internal/processor/results', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://grabpic.app',
          'Access-Control-Request-Method': 'POST',
        },
      }),
      testEnv(),
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    )

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('creates an event without exposing a Convex identifier', async () => {
    client.mutation.mockResolvedValue({
      eventId: 'evt_1234abcd',
      passcode: '123456',
      inviteToken: '0123456789abcdef0123456789abcdef',
    })

    const response = await app.fetch(
      new Request('https://api.test/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Convex Event',
          organizerEmail: 'organizer@example.test',
          organizerName: 'Organizer',
        }),
      }),
      testEnv(),
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    )

    expect(response.status).toBe(201)
    const body = await response.json<Record<string, unknown>>()
    expect(body.eventId).toMatch(/^evt_/)
    expect(body).not.toHaveProperty('_id')
    expect(client.mutation).toHaveBeenCalledOnce()
    expect(client.mutation.mock.calls[0][1]).toMatchObject({
      serviceSecret: 'worker-secret',
      maxPhotos: 100,
      tier: 'free',
      matchThreshold: 0.6,
      clusteringEps: 0.4,
    })
  })

  it('rejects retention beyond 30 days before creating an event', async () => {
    const response = await app.fetch(
      new Request('https://api.test/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Event',
          organizerEmail: 'a@example.test',
          organizerName: 'A',
          expiryDays: 31,
        }),
      }),
      testEnv(),
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    )
    expect(response.status).toBe(400)
    expect(client.mutation).not.toHaveBeenCalled()
  })

  it('uses configured web origin and current API origin for event links', async () => {
    client.mutation.mockResolvedValue({})
    const response = await app.fetch(
      new Request('https://staging-api.test/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Event',
          organizerEmail: 'a@example.test',
          organizerName: 'A',
        }),
      }),
      { ...testEnv(), WEB_BASE_URL: 'https://staging-web.test/' },
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    )
    expect(response.status).toBe(201)
    const body = await response.json<Record<string, string>>()
    expect(body.shareUrl).toMatch(/^https:\/\/staging-web.test\/e\/[a-f0-9]{32}$/)
    expect(body.qrCode).toBe(`https://staging-api.test/qr/${body.eventId}`)
  })

  it('encodes the configured frontend invite in organizer-only uncached QR responses', async () => {
    client.query.mockResolvedValue({ inviteToken: '0123456789abcdef0123456789abcdef' })
    const response = await app.fetch(
      new Request('https://api.test/qr/evt_test', {
        headers: { Authorization: 'Bearer organizer-token' },
      }),
      { ...testEnv(), WEB_BASE_URL: 'https://staging-web.test' },
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    )
    expect(response.status).toBe(200)
    const qrcode = await import('../apps/api/node_modules/qrcode/lib/index.js')
    expect(await response.text()).toBe(
      await qrcode.toString('https://staging-web.test/e/0123456789abcdef0123456789abcdef', {
        type: 'svg',
        width: 400,
        margin: 2,
      }),
    )
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('uses Convex for attendee lookup and preserves the response contract', async () => {
    client.query.mockResolvedValue({
      eventId: 'evt_1234abcd',
      name: 'Convex Event',
      status: 'ready',
    })

    const response = await app.fetch(
      new Request('https://api.test/events/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: '123456' }),
      }),
      testEnv(),
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      eventId: 'evt_1234abcd',
      name: 'Convex Event',
      status: 'ready',
    })
    expect(client.query.mock.calls[0][1]).toMatchObject({
      serviceSecret: 'worker-secret',
      passcode: '123456',
    })
  })

  it('rejects organizer state access before querying Convex when auth is absent', async () => {
    const response = await app.fetch(
      new Request('https://api.test/events/evt_1234abcd/status'),
      testEnv(),
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    )

    expect(response.status).toBe(401)
    expect(client.query).not.toHaveBeenCalled()
  })

  it('checks Convex in the processing health endpoint', async () => {
    client.query.mockResolvedValue({ status: 'ok' })

    const response = await app.fetch(new Request('https://api.test/health/processing'), testEnv(), {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', database: 'connected' })
    expect(client.query).toHaveBeenCalledOnce()
  })

  it('keeps organizer auth at the Worker and deletes external assets before the event', async () => {
    client.mutation
      .mockResolvedValueOnce({ deleting: true })
      .mockResolvedValueOnce({ deletedRecords: 2, eventDeleted: true })
    client.query.mockResolvedValue({
      eventPublicId: 'evt_1234abcd',
      photoCount: 1,
      storageBytes: 1024,
      objectKeys: ['events/evt_1234abcd/photo.jpg'],
    })

    const response = await app.fetch(
      new Request('https://api.test/events/evt_1234abcd', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer organizer-token' },
      }),
      testEnv(),
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted: true, photosDeleted: 1, storageFreed: 1024 })
    expect(client.mutation.mock.calls[0][1]).toMatchObject({
      serviceSecret: 'worker-secret',
      eventPublicId: 'evt_1234abcd',
      organizerTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })
})
