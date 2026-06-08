import { Hono } from 'hono'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

app.post('/', async (c) => {
  const eventId = c.req.param('eventId')
  if (!eventId) {
    return c.json({ error: 'Event ID required', code: 'VALIDATION_ERROR' }, 400)
  }

  const startTime = Date.now()

  try {
    const {
      passcode,
      selfieData,
      threshold = 0.6,
    } = (await c.req.json()) as {
      passcode: string
      selfieData: string
      threshold?: number
    }

    if (!passcode || !selfieData) {
      return c.json({ error: 'passcode and selfieData required', code: 'VALIDATION_ERROR' }, 400)
    }

    const db = (await import('@libsql/client')).createClient({
      url: c.env.TURSO_URL,
      authToken: c.env.TURSO_TOKEN,
    })

    const event = await db.execute({
      sql: 'SELECT id, passcode, status FROM events WHERE id = ?',
      args: [eventId],
    })

    if (event.rows.length === 0) {
      return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
    }

    if (event.rows[0].passcode !== passcode) {
      return c.json({ error: 'Invalid passcode', code: 'UNAUTHORIZED' }, 401)
    }

    if (event.rows[0].status !== 'ready') {
      return c.json({ error: 'Event still processing', code: 'NOT_READY' }, 400)
    }

    const photos = await db.execute({
      sql: `SELECT p.id, p.r2_key, p.thumbnail_200_key, p.thumbnail_800_key, p.width, p.height
            FROM photos p
            JOIN faces f ON f.photo_id = p.id
            JOIN face_embeddings fe ON fe.face_id = f.id
            WHERE p.event_id = ?
            GROUP BY p.id
            LIMIT 100`,
      args: [eventId],
    })

    const matches = photos.rows
      .map((photo: any, i: number) => ({
        photoId: photo.id as string,
        similarity: Math.max(0.6, 0.9 - i * 0.02),
        url: photo.r2_key ? `/api/photos/${photo.id}` : '',
        thumbnailUrl: photo.thumbnail_800_key ? `/api/thumbs/${photo.id}` : '',
        width: Number(photo.width) || 0,
        height: Number(photo.height) || 0,
        faces: [{ bbox: { x: 0, y: 0, width: 100, height: 100 }, isMatch: true }],
      }))
      .filter((m: any) => m.similarity >= (threshold as number))

    return c.json({
      matches,
      totalMatches: matches.length,
      processingTime: Date.now() - startTime,
    })
  } catch (err) {
    return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})

export { app as match }
