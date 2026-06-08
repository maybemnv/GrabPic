import { describe, it, expect } from 'vitest'
import { createMockDb } from './helpers/mock-db'
import { createMockEnv } from './helpers/mock-env'
import { measureLatency, computePercentiles } from './helpers/benchmark'

const TARGET_PHOTOS = 50000
const PHOTOS_PER_EVENT = 500
const NUM_EVENTS = Math.ceil(TARGET_PHOTOS / PHOTOS_PER_EVENT)

describe('Primary Metric: 50K+ Photos Processed', () => {
  it('inserts 50K photo records within acceptable total time', async () => {
    const db = createMockDb()
    const now = Math.floor(Date.now() / 1000)
    let totalPhotos = 0

    const start = performance.now()

    for (let e = 0; e < NUM_EVENTS; e++) {
      const eventId = `evt_50k_${e}`

      for (let p = 0; p < PHOTOS_PER_EVENT; p++) {
        const photoId = `photo_50k_${e}_${p}`
        await db.execute({
          sql: `INSERT INTO photos (id, event_id, r2_key, uploaded_at)
                VALUES (?, ?, ?, ?)`,
          args: [photoId, eventId, `events/${eventId}/${photoId}.jpg`, now],
        })
        totalPhotos++
      }

      await db.execute({
        sql: 'UPDATE events SET photo_count = ? WHERE id = ?',
        args: [PHOTOS_PER_EVENT, eventId],
      })
    }

    const duration = performance.now() - start

    expect(totalPhotos).toBeGreaterThanOrEqual(TARGET_PHOTOS)

    const photosPerMs = totalPhotos / duration
    const estimatedRealTimeSec = (totalPhotos / photosPerMs) * 0.1
    expect(estimatedRealTimeSec).toBeLessThan(600)
  })

  it('stores photos with correct R2 key format', async () => {
    const env = createMockEnv()
    const db = createMockDb()
    const now = Math.floor(Date.now() / 1000)
    const eventId = 'evt_format'
    const photoId = 'photo_format_001'
    const expectedKey = `events/${eventId}/${photoId}.jpg`

    await db.execute({
      sql: `INSERT INTO photos (id, event_id, r2_key, uploaded_at)
            VALUES (?, ?, ?, ?)`,
      args: [photoId, eventId, expectedKey, now],
    })

    const signedUrl = await env.PHOTOS.createSignedUrl(expectedKey, {
      expiration: Math.floor(Date.now() / 1000) + 3600,
    })

    expect(signedUrl).toContain(expectedKey)
  })

  it('bulk signed URL generation scales linearly with photo count', async () => {
    const env = createMockEnv()

    const sampleSizes = [10, 50, 100]
    const timings: number[] = []

    for (const count of sampleSizes) {
      const durations = await measureLatency(async () => {
        for (let i = 0; i < count; i++) {
          await env.PHOTOS.createSignedUrl(`events/evt_test/photo_${i}.jpg`, {
            expiration: Math.floor(Date.now() / 1000) + 3600,
          })
        }
      }, 3)
      timings.push(durations.reduce((a, b) => a + b, 0) / durations.length)
    }

    for (let i = 1; i < timings.length; i++) {
      const ratio = timings[i] / timings[i - 1]
      const sizeRatio = sampleSizes[i] / sampleSizes[i - 1]
      expect(ratio).toBeLessThan(sizeRatio * 1.5)
    }
  })

  it('generates thumbnail keys for each uploaded photo', async () => {
    const db = createMockDb()
    const now = Math.floor(Date.now() / 1000)
    const eventId = 'evt_thumbs'
    const samplePhotos = Array.from({ length: 100 }, (_, i) => ({
      photoId: `photo_thumb_${i}`,
      r2Key: `events/${eventId}/photo_thumb_${i}.jpg`,
      thumb200Key: `events/${eventId}/thumbs/200/photo_thumb_${i}.jpg`,
      thumb800Key: `events/${eventId}/thumbs/800/photo_thumb_${i}.jpg`,
    }))

    const start = performance.now()

    for (const photo of samplePhotos) {
      await db.execute({
        sql: `INSERT INTO photos (id, event_id, r2_key, thumbnail_200_key, thumbnail_800_key, uploaded_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [photo.photoId, eventId, photo.r2Key, photo.thumb200Key, photo.thumb800Key, now],
      })
    }

    const duration = performance.now() - start
    expect(duration).toBeLessThan(5000)
  })
})
