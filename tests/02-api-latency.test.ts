import { describe, it, expect, afterAll } from 'vitest'
import { getApiBaseUrl, isSkippable } from './helpers/setup'
import { measureLatency, computePercentiles } from './helpers/benchmark'

const P95_TARGET_MS = 500

describe.skipIf(isSkippable())('API Latency: p95 <500ms', () => {
  const eventId = `latency_${Date.now()}`
  const api = () => getApiBaseUrl()

  afterAll(async () => {
    try {
      await fetch(`${api()}/events/${eventId}`, { method: 'DELETE' })
    } catch {
      /* cleanup */
    }
  })

  it('event creation p95 latency', async () => {
    const durations = await measureLatency(async () => {
      await fetch(`${api()}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Latency Test',
          organizerEmail: 'latency@test.com',
          organizerName: 'Latency Tester',
          expiryDays: 1,
        }),
      })
    }, 10)

    const stats = computePercentiles(durations)
    expect(stats.p95).toBeLessThan(P95_TARGET_MS)
  })

  it('event status query p95 latency', async () => {
    const durations = await measureLatency(async () => {
      await fetch(`${api()}/events/${eventId}/status`)
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
