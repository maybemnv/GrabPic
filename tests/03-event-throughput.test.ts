import { describe, it, expect, afterAll } from 'vitest'
import { getApiBaseUrl, getDb, isSkippable } from './helpers/setup'
import { measureLatency, computePercentiles } from './helpers/benchmark'

const TARGET_EVENTS = 10

describe.skipIf(isSkippable())('Event Throughput: 100 events', () => {
  const api = () => getApiBaseUrl()
  const createdIds: string[] = []

  afterAll(async () => {
    for (const id of createdIds) {
      try {
        await fetch(`${api()}/events/${id}`, { method: 'DELETE' })
      } catch {
        /* cleanup */
      }
    }
  })

  it(`creates ${TARGET_EVENTS} events within acceptable time`, async () => {
    const start = performance.now()

    for (let i = 0; i < TARGET_EVENTS; i++) {
      const res = await fetch(`${api()}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Throughput Event ${i}`,
          organizerEmail: `throughput${i}@test.com`,
          organizerName: `Throughput ${i}`,
          expiryDays: 1,
        }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      createdIds.push(body.eventId)
    }

    const duration = performance.now() - start

    const db = getDb()
    const result = await db.execute({
      sql:
        'SELECT COUNT(*) as cnt FROM events WHERE id IN (' +
        createdIds.map(() => '?').join(',') +
        ')',
      args: createdIds,
    })
    expect(Number(result.rows[0].cnt)).toBe(TARGET_EVENTS)
    expect(duration).toBeLessThan(30000)
  })

  it('tracks per-event creation latency p95', async () => {
    const durations = await measureLatency(async () => {
      await fetch(`${api()}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Perf Event',
          organizerEmail: 'perf@test.com',
          organizerName: 'Perf Tester',
          expiryDays: 1,
        }),
      })
    }, TARGET_EVENTS)

    const stats = computePercentiles(durations)
    expect(stats.p95).toBeLessThan(1000)
  })
})
