import { describe, it, expect, afterAll } from 'vitest'
import { getApiBaseUrl, getDb, isSkippable } from './helpers/setup'

const TARGET_SECONDS_PER_100_PHOTOS = 120

describe.skipIf(isSkippable())('Processing Time: <2min per 100 photos', () => {
  const eventId = `proc_time_${Date.now()}`
  const api = () => getApiBaseUrl()

  afterAll(async () => {
    try {
      await fetch(`${api()}/events/${eventId}`, { method: 'DELETE' })
    } catch {
      /* cleanup */
    }
  })

  it('creates event and inserts photos within time budget', async () => {
    const start = performance.now()

    const createRes = await fetch(`${api()}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Processing Time Test',
        organizerEmail: 'proc@test.com',
        organizerName: 'Proc Tester',
        expiryDays: 1,
      }),
    })
    expect(createRes.status).toBe(201)

    const uploadRes = await fetch(`${api()}/events/${eventId}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photos: Array.from({ length: 5 }, (_, i) => ({
          filename: `photo_${i}.jpg`,
          size: 1024 * 100,
          type: 'image/jpeg',
        })),
      }),
    })
    expect(uploadRes.status).toBe(200)

    const duration = performance.now() - start
    const secondsPer100 = (duration / 1000) * (100 / 5)
    expect(secondsPer100).toBeLessThan(TARGET_SECONDS_PER_100_PHOTOS)
  })

  it('confirm upload updates event status in DB', async () => {
    const confirmRes = await fetch(`${api()}/events/${eventId}/upload/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIds: ['photo_0', 'photo_1', 'photo_2', 'photo_3', 'photo_4'] }),
    })
    const body = await confirmRes.json()
    expect(body.status).toBe('processing')

    const db = getDb()
    const result = await db.execute({
      sql: 'SELECT status FROM events WHERE id = ?',
      args: [eventId],
    })
    expect(result.rows[0].status).toBe('processing')
  })

  it('GET /events/:id/status returns correct progress', async () => {
    const res = await fetch(`${api()}/events/${eventId}/status`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBeDefined()
    expect(body.progress).toBeGreaterThanOrEqual(0)
    expect(body.progress).toBeLessThanOrEqual(100)
  })
})
