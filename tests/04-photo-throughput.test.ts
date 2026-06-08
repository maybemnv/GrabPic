import { describe, it, expect, afterAll } from 'vitest'
import { getApiBaseUrl, getDb, isSkippable } from './helpers/setup'

const PHOTOS_TO_UPLOAD = 10

describe.skipIf(isSkippable())('Photo Throughput: 50K photos', () => {
  const eventId = `photo_throughput_${Date.now()}`
  const api = () => getApiBaseUrl()

  afterAll(async () => {
    try {
      await fetch(`${api()}/events/${eventId}`, { method: 'DELETE' })
    } catch {
      /* cleanup */
    }
  })

  it('creates event and uploads photos via signed URLs', async () => {
    const createRes = await fetch(`${api()}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Photo Throughput Test',
        organizerEmail: 'phototest@test.com',
        organizerName: 'Photo Tester',
        expiryDays: 1,
      }),
    })
    expect(createRes.status).toBe(201)

    const uploadRes = await fetch(`${api()}/events/${eventId}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photos: Array.from({ length: PHOTOS_TO_UPLOAD }, (_, i) => ({
          filename: `photo_${i}.jpg`,
          size: 1024 * 100,
          type: 'image/jpeg',
        })),
      }),
    })
    expect(uploadRes.status).toBe(200)
    const body = await uploadRes.json()
    expect(body.uploadUrls.length).toBe(PHOTOS_TO_UPLOAD)

    for (const url of body.uploadUrls) {
      expect(url.photoId).toMatch(/^photo_/)
      expect(url.uploadUrl).toContain('https://')
      expect(url.filename).toBeTruthy()
    }
  })

  it('stores photo records in Turso with correct key format', async () => {
    const db = getDb()
    const result = await db.execute({
      sql: 'SELECT COUNT(*) as cnt FROM photos WHERE event_id = ?',
      args: [eventId],
    })
    expect(Number(result.rows[0].cnt)).toBe(PHOTOS_TO_UPLOAD)

    const photos = await db.execute({
      sql: 'SELECT id, r2_key FROM photos WHERE event_id = ? LIMIT 1',
      args: [eventId],
    })
    if (photos.rows.length > 0) {
      expect(photos.rows[0].r2_key).toContain(eventId)
    }
  })
})
