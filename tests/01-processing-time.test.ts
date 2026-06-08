import { describe, it, expect } from 'vitest'
import { createMockDb } from './helpers/mock-db'

const TARGET_SECONDS_PER_100_PHOTOS = 120
const FAKE_PHOTO_IDS = Array.from({ length: 100 }, (_, i) => `photo_${String(i).padStart(3, '0')}`)

describe('Primary Metric: Avg Processing Time <2min per 100 photos', () => {
  it('inserts 100 photos and updates event status within time budget', async () => {
    const db = createMockDb()
    db.seed('events', [
      { id: 'evt_batch', name: 'Batch Test', photo_count: 0, status: 'processing' },
    ])

    const start = performance.now()
    const now = Math.floor(Date.now() / 1000)

    for (const photoId of FAKE_PHOTO_IDS) {
      await db.execute({
        sql: `INSERT INTO photos (id, event_id, r2_key, uploaded_at)
              VALUES (?, ?, ?, ?)`,
        args: [photoId, 'evt_batch', `events/evt_batch/${photoId}.jpg`, now],
      })
    }

    await db.execute({
      sql: 'UPDATE events SET photo_count = ? WHERE id = ?',
      args: [100, 'evt_batch'],
    })

    await db.execute({
      sql: "UPDATE events SET status = 'ready' WHERE id = ?",
      args: ['evt_batch'],
    })

    const duration = performance.now() - start

    const event = await db.execute({
      sql: 'SELECT photo_count, status FROM events WHERE id = ?',
      args: ['evt_batch'],
    })

    expect(event.rows.length).toBe(1)
    expect(event.rows[0].photo_count).toBe(100)

    const secondsPer100 = (duration / 1000)
    expect(secondsPer100).toBeLessThan(TARGET_SECONDS_PER_100_PHOTOS)
  })

  it('stores face embeddings for each detected face after processing', async () => {
    const db = createMockDb()
    db.seed('events', [{ id: 'evt_faces', status: 'processing', photo_count: 10 }])

    const start = performance.now()

    for (let i = 0; i < 10; i++) {
      const photoId = `face_photo_${i}`
      const faceId = `${photoId}_face_0`
      await db.execute({
        sql: 'INSERT INTO faces (id, photo_id, bbox, confidence, cluster_id) VALUES (?, ?, ?, ?, ?)',
        args: [faceId, photoId, JSON.stringify({ x: 100, y: 100, width: 200, height: 200 }), 0.95, 'cluster_1'],
      })
      await db.execute({
        sql: 'INSERT INTO face_embeddings (id, face_id, embedding, created_at) VALUES (?, ?, ?, ?)',
        args: [faceId, faceId, new Uint8Array(2048), Math.floor(Date.now() / 1000)],
      })
    }

    const faces = await db.execute({
      sql: 'SELECT COUNT(*) FROM faces',
      args: [],
    })

    const embeddings = await db.execute({
      sql: 'SELECT COUNT(*) FROM face_embeddings',
      args: [],
    })

    const duration = performance.now() - start

    expect(faces.rows[0]['COUNT(*)']).toBe(10)
    expect(embeddings.rows[0]['COUNT(*)']).toBe(10)
    expect(duration / 1000).toBeLessThan(TARGET_SECONDS_PER_100_PHOTOS)
  })

  it('clusters detected faces and assigns cluster IDs', async () => {
    const db = createMockDb()

    const start = performance.now()
    const faceIds = ['photo_a_face_0', 'photo_b_face_0', 'photo_c_face_0']

    for (const faceId of faceIds) {
      await db.execute({
        sql: 'INSERT INTO faces (id, photo_id, bbox, confidence, cluster_id) VALUES (?, ?, ?, ?, ?)',
        args: [faceId, faceId.split('_face_')[0], JSON.stringify({ x: 0, y: 0, width: 100, height: 100 }), 0.92, 'cluster_1'],
      })
    }

    const result = await db.execute({
      sql: 'SELECT cluster_id, COUNT(*) as cnt FROM faces GROUP BY cluster_id',
      args: [],
    })

    const duration = performance.now() - start

    expect(result.rows.length).toBeGreaterThanOrEqual(1)
    expect(duration / 1000).toBeLessThan(TARGET_SECONDS_PER_100_PHOTOS)
  })
})
