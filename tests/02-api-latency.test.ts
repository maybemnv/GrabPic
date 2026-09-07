import { describe, it, expect, afterAll } from 'vitest'
import { getApiBaseUrl, isSkippable } from './helpers/setup'
import { measureLatency, computePercentiles } from './helpers/benchmark'

const P95_TARGET_MS = 500

describe.skipIf(isSkippable())('API Latency: p95 <500ms', () => {
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

  it('event creation p95 latency', async () => {
    const durations = await measureLatency(async () => {
      const response = await fetch(`${api()}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Latency Test',
          organizerEmail: 'latency@test.com',
          organizerName: 'Latency Tester',
          expiryDays: 1,
        }),
      })
      if (!eventId) {
        const body = await response.json()
        eventId = body.eventId
        organizerToken = body.organizerToken
      }
    }, 10)

    const stats = computePercentiles(durations)
    expect(stats.p95).toBeLessThan(P95_TARGET_MS)
  })

  it('event status query p95 latency', async () => {
    const durations = await measureLatency(async () => {
      await fetch(`${api()}/events/${eventId}/status`, {
        headers: { Authorization: `Bearer ${organizerToken}` },
      })
    }, 10)

    const stats = computePercentiles(durations)
    expect(stats.p95).toBeLessThan(P95_TARGET_MS)
  })

  it('health endpoint p95 latency', async () => {
    const durations = await measureLatency(async () => {
      await fetch(`${api()}/health`)
    }, 10)

    const stats = computePercentiles(durations)
    expect(stats.p95).toBeLessThan(P95_TARGET_MS)
  })
})
