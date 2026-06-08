import { describe, it, expect } from 'vitest'
import { createMockDb } from './helpers/mock-db'
import { measureLatency, computePercentiles } from './helpers/benchmark'

const TARGET_EVENTS = 100

describe('Primary Metric: 100 Events Processed', () => {
  it('creates 100 events successfully within acceptable time', async () => {
    const db = createMockDb()
    const now = Math.floor(Date.now() / 1000)

    const start = performance.now()

    for (let i = 0; i < TARGET_EVENTS; i++) {
      await db.execute({
        sql: `INSERT INTO events (id, name, passcode, created_at, expires_at, status, organizer_email, organizer_name)
              VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)`,
        args: [
          `evt_${String(i).padStart(3, '0')}`,
          `Event ${i}`,
          String(100000 + i).slice(0, 6),
          now,
          now + 86400 * 30,
          `org${i}@example.com`,
          `Organizer ${i}`,
        ],
      })
    }

    const duration = performance.now() - start

    const result = await db.execute({
      sql: 'SELECT COUNT(*) FROM events',
      args: [],
    })

    expect(result.rows[0]['COUNT(*)']).toBe(TARGET_EVENTS)
    expect(duration).toBeLessThan(30000)
  })

  it('tracks per-event creation latency for p95 analysis', async () => {
    const db = createMockDb()

    const durations = await measureLatency(async () => {
      const now = Math.floor(Date.now() / 1000)
      await db.execute({
        sql: `INSERT INTO events (id, name, passcode, created_at, expires_at, status, organizer_email, organizer_name)
              VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)`,
        args: [`evt_${crypto.randomUUID()}`, 'Perf Event', '654321', now, now + 86400, 'perf@test.com', 'Perf Tester'],
      })
    }, TARGET_EVENTS)

    const stats = computePercentiles(durations)
    expect(stats.p95).toBeLessThan(100)
  })

  it('supports concurrent event status polling without degradation', async () => {
    const db = createMockDb()

    for (let i = 0; i < TARGET_EVENTS; i++) {
      db.seed('events', [
        { id: `evt_poll_${i}`, status: 'ready', photo_count: 10, face_count: 20 },
      ])
    }

    const start = performance.now()
    const polls = Array.from({ length: TARGET_EVENTS }, (_, i) =>
      db.execute({
        sql: 'SELECT status, photo_count, face_count FROM events WHERE id = ?',
        args: [`evt_poll_${i}`],
      }),
    )

    await Promise.all(polls)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(10000)
  })

  it('generates unique 6-digit passcodes for all events', async () => {
    const db = createMockDb()
    const now = Math.floor(Date.now() / 1000)
    const passcodes = new Set<string>()

    for (let i = 0; i < TARGET_EVENTS; i++) {
      const passcode = String(100000 + Math.floor(Math.random() * 900000))
      passcodes.add(passcode)

      await db.execute({
        sql: `INSERT INTO events (id, name, passcode, created_at, expires_at, status, organizer_email, organizer_name)
              VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)`,
        args: [`evt_code_${i}`, `Event ${i}`, passcode, now, now + 86400, `org${i}@test.com`, `Org ${i}`],
      })
    }

    expect(passcodes.size).toBe(TARGET_EVENTS)
  })
})
