import { Hono } from 'hono'
import { z } from 'zod'
import type { Env } from '../index'

const app = new Hono<{ Bindings: Env }>()

const uploadSchema = z.object({
  photos: z.array(z.object({
    filename: z.string(),
    size: z.number().int().max(50 * 1024 * 1024),
    type: z.string(),
  })).min(1).max(1000),
})

app.post('/', async (c) => {
  const eventId = c.req.param('eventId')
  if (!eventId) {
    return c.json({ error: 'Event ID required', code: 'VALIDATION_ERROR' }, 400)
  }

  try {
    const body = await c.req.json()
    const parsed = uploadSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.message, code: 'VALIDATION_ERROR' }, 400)
    }

    const { photos } = parsed.data
    const bucket = c.env.PHOTOS

    const uploadUrls = await Promise.all(photos.map(async (photo) => {
      const photoId = `photo_${crypto.randomUUID().slice(0, 8)}`
      const key = `events/${eventId}/${photoId}.jpg`

      const uploadUrl = await (bucket as any).createSignedUrl(key, {
        expiration: Math.floor(Date.now() / 1000) + 3600,
        method: 'PUT',
      })

      return { photoId, uploadUrl, filename: photo.filename }
    }))

    return c.json({ uploadUrls })
  } catch (err) {
    return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})

app.post('/confirm', async (c) => {
  const eventId = c.req.param('eventId')
  if (!eventId) {
    return c.json({ error: 'Event ID required', code: 'VALIDATION_ERROR' }, 400)
  }

  try {
    const body = await c.req.json()
    const { photoIds } = body as { photoIds: string[] }

    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return c.json({ error: 'photoIds required', code: 'VALIDATION_ERROR' }, 400)
    }

    const now = Math.floor(Date.now() / 1000)
    const { execute } = await import('@grabpic/db')
    const db = (await import('@libsql/client')).createClient({
      url: c.env.TURSO_URL,
      authToken: c.env.TURSO_TOKEN,
    })

    for (const photoId of photoIds) {
      await db.execute({
        sql: `INSERT INTO photos (id, event_id, r2_key, uploaded_at)
              VALUES (?, ?, ?, ?)`,
        args: [photoId, eventId, `events/${eventId}/${photoId}.jpg`, now],
      })
    }

    await db.execute({
      sql: 'UPDATE events SET photo_count = photo_count + ? WHERE id = ?',
      args: [photoIds.length, eventId],
    })

    if (c.env.MODAL_WEBHOOK_URL && c.env.MODAL_TOKEN) {
      c.executionCtx.waitUntil(
        fetch(c.env.MODAL_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${c.env.MODAL_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ event_id: eventId, photo_ids: photoIds }),
        }).catch(() => {}),
      )
    }

    return c.json({
      status: 'processing',
      jobId: `job_${eventId}`,
      estimatedTime: 120,
    }, 202)
  } catch (err) {
    return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
})

export { app as upload }
