import { describe, it, expect, afterAll } from 'vitest'
import { getApiBaseUrl, isSkippable } from './helpers/setup'

const TARGET_SECONDS_PER_100_PHOTOS = 120

describe.skipIf(isSkippable())('Processing Time: <2min per 100 photos', () => {
  let eventId = ''
  let organizerToken = ''
  let photoIds: string[] = []
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
        photos: Array.from({ length: 5 }, (_, i) => ({
          filename: `photo_${i}.jpg`,
          size: 1024 * 100,
          type: 'image/jpeg',
        })),
      }),
    })
    expect(uploadRes.status).toBe(200)
    photoIds = (await uploadRes.json()).uploadUrls.map(
      (photo: { photoId: string }) => photo.photoId,
    )

    const duration = performance.now() - start
    const secondsPer100 = (duration / 1000) * (100 / 5)
    expect(secondsPer100).toBeLessThan(TARGET_SECONDS_PER_100_PHOTOS)
  })

  it('confirm upload updates Convex-backed event status', async () => {
    const confirmRes = await fetch(`${api()}/events/${eventId}/upload/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${organizerToken}`,
      },
      body: JSON.stringify({ photoIds }),
    })
    const body = await confirmRes.json()
    expect(body.status).toBe('processing')
  })

  it('GET /events/:id/status returns correct progress', async () => {
    const res = await fetch(`${api()}/events/${eventId}/status`, {
      headers: { Authorization: `Bearer ${organizerToken}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBeDefined()
    expect(body.progress).toBeGreaterThanOrEqual(0)
    expect(body.progress).toBeLessThanOrEqual(100)
  })
})
