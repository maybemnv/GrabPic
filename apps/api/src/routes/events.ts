import { Hono } from 'hono'
import { z } from 'zod'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  organizerEmail: z.string().email(),
  organizerName: z.string().min(1).max(100),
  expiryDays: z.number().int().min(1).max(90).default(30),
})

function generatePasscode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function generateId(prefix: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `${prefix}_${result}`
}

app.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const parsed = createEventSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, 400)
    }

    const { name, organizerEmail, organizerName, expiryDays } = parsed.data
    const eventId = generateId('evt')
    const passcode = generatePasscode()
    const now = Math.floor(Date.now() / 1000)

    const db = (await import('@libsql/client')).createClient({
      url: c.env.TURSO_URL,
      authToken: c.env.TURSO_TOKEN,
    })

    await db.execute({
      sql: `INSERT INTO events (id, name, passcode, created_at, expires_at, status, organizer_email, organizer_name)
            VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)`,
      args: [eventId, name, passcode, now, now + expiryDays * 86400, organizerEmail, organizerName],
    })

    return c.json(
      {
        eventId,
        passcode,
        uploadUrl: `/events/${eventId}/upload`,
        shareUrl: `https://grabpic.app/e/${passcode}`,
        qrCode: `https://api.grabpic.app/qr/${eventId}`,
        expiresAt: now + expiryDays * 86400,
      },
      201,
    )
  } catch (err) {
    return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})

app.get('/:eventId', async (c) => {
  const eventId = c.req.param('eventId')

  const db = (await import('@libsql/client')).createClient({
    url: c.env.TURSO_URL,
    authToken: c.env.TURSO_TOKEN,
  })

  const result = await db.execute({
    sql: 'SELECT * FROM events WHERE id = ?',
    args: [eventId],
  })

  if (result.rows.length === 0) {
    return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
  }

  return c.json(result.rows[0])
})

app.get('/:eventId/status', async (c) => {
  const eventId = c.req.param('eventId')

  const db = (await import('@libsql/client')).createClient({
    url: c.env.TURSO_URL,
    authToken: c.env.TURSO_TOKEN,
  })

  const result = await db.execute({
    sql: 'SELECT status, photo_count, face_count FROM events WHERE id = ?',
    args: [eventId],
  })

  if (result.rows.length === 0) {
    return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
  }

  const row = result.rows[0]
  const faceCount = Number(row.face_count) || 0
  const photoCount = Number(row.photo_count) || 0

  return c.json({
    status: row.status,
    photoCount,
    faceCount,
    progress: row.status === 'ready' ? 100 : row.status === 'processing' ? 50 : 0,
    error: null,
  })
})

app.delete('/:eventId', async (c) => {
  const eventId = c.req.param('eventId')

  const db = (await import('@libsql/client')).createClient({
    url: c.env.TURSO_URL,
    authToken: c.env.TURSO_TOKEN,
  })

  const result = await db.execute({
    sql: 'SELECT photo_count FROM events WHERE id = ?',
    args: [eventId],
  })

  if (result.rows.length === 0) {
    return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
  }

  const photosDeleted = Number(result.rows[0].photo_count) || 0
  const storageFreed = photosDeleted * 5 * 1024 * 1024

  await db.execute({
    sql: 'DELETE FROM events WHERE id = ?',
    args: [eventId],
  })

  return c.json({ deleted: true, photosDeleted, storageFreed })
})

export { app as events }
