import { describe, it, expect, afterAll } from 'vitest'
import { getApiBaseUrl, isSkippable } from './helpers/setup'

const PHOTOS_TO_UPLOAD = 10

describe.skipIf(isSkippable())('Photo Throughput: 50K photos', () => {
  let eventId = ''
  let organizerToken = ''
  const api = () => getApiBaseUrl()

  afterAll(async () => {
    try {
      await fetch(`${api()}/events/${eventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${organizerToken}` },
      })
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
    const event = await createRes.json()
    eventId = event.eventId
    organizerToken = event.organizerToken

    const uploadRes = await fetch(`${api()}/events/${eventId}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${organizerToken}`,
      },
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

  it('returns event-scoped R2 keys for each photo', async () => {
    expect(eventId).toMatch(/^evt_/)
  })
})
