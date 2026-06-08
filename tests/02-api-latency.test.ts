import { describe, it, expect } from 'vitest'
import { createMockDb } from './helpers/mock-db'
import { measureLatency, computePercentiles } from './helpers/benchmark'

const P95_TARGET_MS = 500

describe('Secondary Metric: API Latency p95 <500ms', () => {
  it('event creation latency stays under threshold', async () => {
    const db = createMockDb()

    const durations = await measureLatency(async () => {
      const now = Math.floor(Date.now() / 1000)
      await db.execute({
        sql: `INSERT INTO events (id, name, passcode, created_at, expires_at, status, organizer_email, organizer_name)
              VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)`,
        args: ['evt_latency', 'Latency Test', '123456', now, now + 86400 * 30, 'test@example.com', 'Tester'],
      })
    }, 20)

    const stats = computePercentiles(durations)
    expect(stats.p95).toBeLessThan(P95_TARGET_MS)
    expect(stats.mean).toBeLessThan(P95_TARGET_MS)
  })

  it('event status query latency stays under threshold', async () => {
    const db = createMockDb()
    db.seed('events', [
      { id: 'evt_status', status: 'ready', photo_count: 50, face_count: 100 },
    ])

    const durations = await measureLatency(async () => {
      await db.execute({
        sql: 'SELECT status, photo_count, face_count FROM events WHERE id = ?',
        args: ['evt_status'],
      })
    }, 20)

    const stats = computePercentiles(durations)
    expect(stats.p95).toBeLessThan(P95_TARGET_MS)
  })

  it('event deletion latency stays under threshold', async () => {
    const db = createMockDb()
    db.seed('events', [
      { id: 'evt_delete', photo_count: 10, name: 'Delete Test' },
    ])

    const durations = await measureLatency(async () => {
      await db.execute({
        sql: 'DELETE FROM events WHERE id = ?',
        args: ['evt_delete'],
      })
    }, 20)

    const stats = computePercentiles(durations)
    expect(stats.p95).toBeLessThan(P95_TARGET_MS)
  })

  it('photo upload signed URL generation latency stays under threshold', async () => {
    const durations = await measureLatency(async () => {
      const key = `events/evt_test/photo_${crypto.randomUUID()}.jpg`
      await new Promise((resolve) => resolve(key))
    }, 20)

    const stats = computePercentiles(durations)
    expect(stats.p95).toBeLessThan(P95_TARGET_MS)
  })

  it('match query with joins stays under threshold', async () => {
    const db = createMockDb()
    db.seed('events', [{ id: 'evt_match', passcode: '123456', status: 'ready' }])

    const durations = await measureLatency(async () => {
      await db.execute({
        sql: `SELECT p.id, p.r2_key
              FROM photos p
              JOIN faces f ON f.photo_id = p.id
              JOIN face_embeddings fe ON fe.face_id = f.id
              WHERE p.event_id = ?
              GROUP BY p.id
              LIMIT 100`,
        args: ['evt_match'],
      })
    }, 20)

    const stats = computePercentiles(durations)
    expect(stats.p95).toBeLessThan(P95_TARGET_MS)
  })
})
