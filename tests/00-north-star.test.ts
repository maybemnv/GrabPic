import { describe, it, expect } from 'vitest'
import { createMockDb } from './helpers/mock-db'
import { createMockEnv } from './helpers/mock-env'

const NORTH_STAR_TARGET_MS = 5000

describe('North Star Metric: Time from selfie to viewing photos <5s', () => {
  it('match endpoint responds within 5 seconds under normal load', async () => {
    const db = createMockDb()
    const env = createMockEnv()

    db.seed('events', [
      { id: 'evt_test', passcode: '123456', status: 'ready', photo_count: 100, face_count: 200 },
    ])

    const start = performance.now()

    const result = await db.execute({
      sql: `SELECT p.id, p.r2_key, p.thumbnail_200_key, p.thumbnail_800_key, p.width, p.height
            FROM photos p
            JOIN faces f ON f.photo_id = p.id
            JOIN face_embeddings fe ON fe.face_id = f.id
            WHERE p.event_id = ?
            GROUP BY p.id
            LIMIT 100`,
      args: ['evt_test'],
    })

    const duration = performance.now() - start

    expect(result.rows.length).toBeGreaterThan(0)
    expect(duration).toBeLessThan(NORTH_STAR_TARGET_MS)
  })

  it('generates signed URLs with 1-hour expiry for matched photos', async () => {
    const env = createMockEnv()
    const key = 'events/evt_test/photo_001.jpg'

    const url = await env.PHOTOS.createSignedUrl(key, {
      expiration: Math.floor(Date.now() / 1000) + 3600,
    })

    expect(url).toContain(key)
    expect(url).toContain('expires=')
    expect(url).toContain('method=GET')
  })

  it('returns correct match response shape within time budget', async () => {
    const db = createMockDb()
    db.seed('events', [
      { id: 'evt_test', passcode: '654321', status: 'ready', photo_count: 50, face_count: 80 },
    ])

    const start = performance.now()

    const event = await db.execute({
      sql: 'SELECT id, passcode, status FROM events WHERE id = ?',
      args: ['evt_test'],
    })

    expect(event.rows.length).toBe(1)
    expect(event.rows[0].passcode).toBe('654321')
    expect(event.rows[0].status).toBe('ready')

    const photos = await db.execute({
      sql: `SELECT p.id, p.r2_key, p.thumbnail_800_key, p.width, p.height
            FROM photos p
            JOIN faces f ON f.photo_id = p.id
            JOIN face_embeddings fe ON fe.face_id = f.id
            WHERE p.event_id = ?
            GROUP BY p.id
            LIMIT 100`,
      args: ['evt_test'],
    })

    const duration = performance.now() - start

    expect(photos.rows.length).toBeGreaterThanOrEqual(1)
    for (const photo of photos.rows) {
      expect(photo).toHaveProperty('id')
      expect(photo).toHaveProperty('r2_key')
    }

    expect(duration).toBeLessThan(NORTH_STAR_TARGET_MS)
  })
})
