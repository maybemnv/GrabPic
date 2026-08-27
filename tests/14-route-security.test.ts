import { describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@libsql/client', () => ({ createClient: createClientMock }))

import app, { type Env } from '../apps/api/src/index'
import { hashOrganizerToken } from '../apps/api/src/lib/organizer-auth'
import { MAX_UPLOAD_BYTES } from '../apps/api/src/lib/upload'

const eventRow = {
  id: 'evt_1',
  name: 'Private Event',
  passcode: '123456',
  invite_token: '0123456789abcdef0123456789abcdef',
  organizer_token_hash: 'not-the-raw-token',
  status: 'processing',
  photo_count: 0,
  face_count: 0,
  created_at: 1,
  expires_at: 9999999999,
}

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
    MODAL_WEBHOOK_URL: '',
    MODAL_EMBEDDING_URL: '',
    MATCH_THRESHOLD: '0.6',
    TURSO_URL: 'libsql://test.turso.io',
    TURSO_TOKEN: 'token',
  }
}

describe('organizer route authorization', () => {
  it('rejects attendee access to organizer event, upload, delete, and QR routes', async () => {
    const db = {
      execute: vi.fn(async (statement: string | { sql: string; args?: unknown[] }) => {
        const sql = typeof statement === 'string' ? statement : statement.sql
        if (sql.includes('SELECT * FROM events')) return { rows: [eventRow] }
        if (sql.includes('organizer_token_hash FROM events')) return { rows: [eventRow] }
        if (sql.includes('SELECT invite_token')) return { rows: [eventRow] }
        return { rows: [] }
      }),
    }
    createClientMock.mockReturnValue(db)

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
    const organizerTokenHash = await hashOrganizerToken('organizer-secret')
    const db = {
      execute: vi.fn(async (statement: string | { sql: string }) => {
        const sql = typeof statement === 'string' ? statement : statement.sql
        const eventId = typeof statement === 'string' ? '' : String(statement.args?.[0] ?? '')
        if (sql.includes('organizer_token_hash FROM events')) {
          if (eventId === 'missing') return { rows: [] }
          return {
            rows: [{ ...eventRow, organizer_token_hash: organizerTokenHash }],
          }
        }
        return { rows: [], rowsAffected: 0 }
      }),
    }
    createClientMock.mockReturnValue(db)
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
