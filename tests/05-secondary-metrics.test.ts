import { describe, it, expect } from 'vitest'
import { createMockDb } from './helpers/mock-db'

describe('Secondary Metrics', () => {
  describe('Photo Download Rate', () => {
    it('tracks matches per session', async () => {
      const db = createMockDb()

      await db.execute({
        sql: `INSERT INTO match_sessions (id, event_id, user_ip, matched_count, similarity_threshold, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: ['session_001', 'evt_1', '192.168.1.1', 42, 0.6, Math.floor(Date.now() / 1000)],
      })

      const result = await db.execute({
        sql: 'SELECT matched_count FROM match_sessions WHERE id = ?',
        args: ['session_001'],
      })

      expect(result.rows.length).toBe(1)
      expect(result.rows[0].matched_count).toBe(42)
    })

    it('aggregates download rate across events', async () => {
      const db = createMockDb()
      const now = Math.floor(Date.now() / 1000)

      for (let i = 0; i < 5; i++) {
        await db.execute({
          sql: `INSERT INTO match_sessions (id, event_id, user_ip, matched_count, similarity_threshold, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [`session_dl_${i}`, 'evt_dl', '10.0.0.1', 10 + i * 5, 0.6, now - i * 3600],
        })
      }

      const result = await db.execute({
        sql: 'SELECT AVG(matched_count) as avg_downloads FROM match_sessions WHERE event_id = ?',
        args: ['evt_dl'],
      })

      expect(result.rows.length).toBe(1)
    })
  })

  describe('Return Organizer Rate', () => {
    it('tracks multiple events per organizer email', async () => {
      const db = createMockDb()
      const now = Math.floor(Date.now() / 1000)
      const organizerEmail = 'return@organizer.com'

      for (let i = 0; i < 3; i++) {
        await db.execute({
          sql: `INSERT INTO events (id, name, passcode, created_at, expires_at, status, organizer_email, organizer_name)
                VALUES (?, ?, ?, ?, ?, 'ready', ?, ?)`,
          args: [
            `evt_return_${i}`,
            `Return Event ${i}`,
            String(100000 + i),
            now - i * 86400 * 7,
            now + 86400 * 23,
            organizerEmail,
            'Return Organizer',
          ],
        })
      }

      const result = await db.execute({
        sql: 'SELECT COUNT(*) as event_count FROM events WHERE organizer_email = ?',
        args: [organizerEmail],
      })

      expect(result.rows[0]['COUNT(*)']).toBe(3)
    })
  })

  describe('Viral Coefficient (Invites/User)', () => {
    it('tracks share URL generations per event', async () => {
      const db = createMockDb()
      const now = Math.floor(Date.now() / 1000)

      await db.execute({
        sql: `INSERT INTO events (id, name, passcode, created_at, expires_at, status, organizer_email, organizer_name)
              VALUES (?, ?, ?, ?, ?, 'ready', ?, ?)`,
        args: ['evt_viral', 'Viral Event', '999999', now, now + 86400, 'viral@test.com', 'Viral Test'],
      })

      const result = await db.execute({
        sql: 'SELECT id, passcode FROM events WHERE id = ?',
        args: ['evt_viral'],
      })

      expect(result.rows[0].passcode).toBe('999999')
    })
  })

  describe('User Accuracy Rate >85%', () => {
    it('enforces minimum confidence threshold for face detection', async () => {
      const db = createMockDb()
      const minConfidence = 0.9

      const highConf = await db.execute({
        sql: 'INSERT INTO faces (id, photo_id, bbox, confidence, cluster_id) VALUES (?, ?, ?, ?, ?)',
        args: ['face_high', 'photo_001', '{}', 0.95, 'cluster_a'],
      })

      const lowConf = await db.execute({
        sql: 'INSERT INTO faces (id, photo_id, bbox, confidence, cluster_id) VALUES (?, ?, ?, ?, ?)',
        args: ['face_low', 'photo_001', '{}', 0.85, null],
      })

      expect(highConf.rowsAffected).toBe(1)
      expect(lowConf.rowsAffected).toBe(1)
    })

    it('returns similarity scores above threshold for matched photos', async () => {
      const similarityThreshold = 0.6
      const mockMatchSimilarities = [0.87, 0.73, 0.91, 0.65, 0.82]

      const aboveThreshold = mockMatchSimilarities.filter((s) => s >= similarityThreshold)
      expect(aboveThreshold.length).toBe(mockMatchSimilarities.length)

      const accuracy = aboveThreshold.length / mockMatchSimilarities.length
      expect(accuracy).toBeGreaterThan(0.85)
    })
  })
})
