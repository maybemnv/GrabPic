import { describe, it, expect, afterAll } from 'vitest'
import { getApiBaseUrl, getDb, isSkippable } from './helpers/setup'

describe.skipIf(isSkippable())('Secondary Metrics', () => {
  const eventId = `secondary_${Date.now()}`
  const api = () => getApiBaseUrl()

  afterAll(async () => {
    try {
      await fetch(`${api()}/events/${eventId}`, { method: 'DELETE' })
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

      const db = getDb()
      await db.execute({
        sql: `INSERT INTO match_sessions (id, event_id, user_ip, matched_count, similarity_threshold, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [`session_${eventId}`, eventId, '127.0.0.1', 42, 0.6, Math.floor(Date.now() / 1000)],
      })

      const result = await db.execute({
        sql: 'SELECT matched_count FROM match_sessions WHERE id = ?',
        args: [`session_${eventId}`],
      })
      expect(Number(result.rows[0].matched_count)).toBe(42)
    })
  })

  describe('Return Organizer Tracking', () => {
    it('tracks multiple events per organizer email', async () => {
      const email = `return_${eventId}@organizer.com`
      const db = getDb()
      const now = Math.floor(Date.now() / 1000)

      for (let i = 0; i < 3; i++) {
        await db.execute({
          sql: `INSERT INTO events (id, name, passcode, created_at, expires_at, status, organizer_email, organizer_name)
                VALUES (?, ?, ?, ?, ?, 'ready', ?, ?)`,
          args: [
            `evt_return_${eventId}_${i}`,
            `Return Event ${i}`,
            String(100000 + i),
            now - i * 86400,
            now + 86400 * 29,
            email,
            'Return Organizer',
          ],
        })
      }

      const result = await db.execute({
        sql: 'SELECT COUNT(*) as cnt FROM events WHERE organizer_email = ?',
        args: [email],
      })
      expect(Number(result.rows[0].cnt)).toBe(3)
    })
  })
})
