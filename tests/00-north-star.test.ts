import { describe, it, expect, afterAll } from 'vitest'
import { getApiBaseUrl, isSkippable } from './helpers/setup'

const NORTH_STAR_TARGET_MS = 5000

describe.skipIf(isSkippable())('North Star Metric: Selfie → Gallery <5s', () => {
  let eventId = ''
  let passcode = ''
  let organizerToken = ''
  const api = () => getApiBaseUrl()

  afterAll(async () => {
    try {
      await fetch(`${api()}/events/${eventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${organizerToken}` },
      })
    } catch {
      /* cleanup best-effort */
    }
  })

  it('creates event via real API', async () => {
    const res = await fetch(`${api()}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'North Star Test',
        organizerEmail: 'test@northstar.com',
        organizerName: 'North Star',
        expiryDays: 1,
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    eventId = body.eventId
    passcode = body.passcode
    organizerToken = body.organizerToken
    expect(eventId).toBeDefined()
    expect(passcode).toMatch(/^\d{6}$/)
  })

  it('match endpoint responds within 5 seconds (no-matches case)', async () => {
    const start = performance.now()

    const res = await fetch(`${api()}/events/${eventId}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        passcode,
        selfieData: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
        threshold: 0.6,
      }),
    })

    const duration = performance.now() - start
    expect(duration).toBeLessThan(NORTH_STAR_TARGET_MS)

    if (res.status === 200) {
      const body = await res.json()
      expect(body).toHaveProperty('matches')
      expect(body).toHaveProperty('processingTime')
    }
  })

  it('event status endpoint returns correct shape', async () => {
    const res = await fetch(`${api()}/events/${eventId}/status`, {
      headers: { Authorization: `Bearer ${organizerToken}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('status')
    expect(['processing', 'ready', 'failed', 'expired']).toContain(body.status)
    expect(body).toHaveProperty('photoCount')
    expect(body).toHaveProperty('faceCount')
  })

  it('organizer detail returns the persisted event contract', async () => {
    const res = await fetch(`${api()}/events/${eventId}`, {
      headers: { Authorization: `Bearer ${organizerToken}` },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe(eventId)
  })
})
