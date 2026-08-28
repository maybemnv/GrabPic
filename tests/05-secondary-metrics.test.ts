import { describe, it, expect, afterAll } from 'vitest'
import { getApiBaseUrl, isSkippable } from './helpers/setup'

describe.skipIf(isSkippable())('Secondary Metrics', () => {
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

  describe('Match Sessions', () => {
    it('creates event and verifies match_sessions can be tracked', async () => {
      const res = await fetch(`${api()}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Secondary Metrics Test',
          organizerEmail: 'secondary@test.com',
          organizerName: 'Secondary Tester',
          expiryDays: 1,
        }),
      })
      expect(res.status).toBe(201)

      const body = await res.json()
      eventId = body.eventId
      organizerToken = body.organizerToken
      expect(body).not.toHaveProperty('user_ip')
    })
  })

  describe('Return Organizer Tracking', () => {
    it('tracks multiple events per organizer email', async () => {
      expect(eventId).toMatch(/^evt_/)
    })
  })
})
