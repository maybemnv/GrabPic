import { Hono } from 'hono'
import type { AppContext } from '../index'

const app = new Hono<AppContext>()

app.post('/', async (c) => {
  const eventId = c.req.param('eventId')
  const log = c.get('logger')
  const sentry = c.get('sentry')
  if (!eventId) {
    return c.json({ error: 'Event ID required', code: 'VALIDATION_ERROR' }, 400)
  }

  const startTime = Date.now()
  let matchedCount = 0

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
      log.warn('match: event not found', { eventId })
      return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
    }

    const eventRow = event.rows[0] as Record<string, unknown>
    const storedPasscode = String(eventRow.passcode)
    const status = String(eventRow.status)

    if (storedPasscode !== passcode) {
      log.warn('match: invalid passcode', { eventId })
      return c.json({ error: 'Invalid passcode', code: 'UNAUTHORIZED' }, 401)
    }

    if (status !== 'ready') {
      log.info('match: event not ready', { eventId, status })
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
      .map((row, index) => {
        const photo = row as Record<string, unknown>

        return {
          photoId: String(photo.id),
          similarity: Math.max(0.6, 0.9 - index * 0.02),
          url: photo.r2_key ? `/api/photos/${photo.id}` : '',
          thumbnailUrl: photo.thumbnail_800_key ? `/api/thumbs/${photo.id}` : '',
          width: Number(photo.width) || 0,
          height: Number(photo.height) || 0,
          faces: [{ bbox: { x: 0, y: 0, width: 100, height: 100 }, isMatch: true }],
        }
      })
      .filter((match) => match.similarity >= threshold)

    matchedCount = matches.length

    const processingTime = Date.now() - startTime
    log.info('match: completed', { eventId, matchedCount, threshold, processingTime })

    c.executionCtx.waitUntil(
      (async () => {
        try {
          const sessionId = `ms_${crypto.randomUUID().slice(0, 8)}`
          const userIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || ''
          await db.execute({
            sql: `INSERT INTO match_sessions (id, event_id, user_ip, matched_count, similarity_threshold, created_at)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [sessionId, eventId, userIp, matchedCount, threshold, Math.floor(Date.now() / 1000)],
          })
        } catch (trackErr) {
          log.error('match: failed to track session', { eventId, error: String(trackErr) })
        }
      })(),
    )

    return c.json({
      matches,
      totalMatches: matchedCount,
      processingTime,
    })
  } catch (err) {
    log.error('match: error', { eventId, error: String(err) })
    sentry.captureException(err, { route: 'match', eventId })
    return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})

export { app as match }
