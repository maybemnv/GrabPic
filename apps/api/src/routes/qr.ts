import { Hono } from 'hono'
import type { AppContext } from '../index'
import { verifyOrganizerToken } from '../lib/organizer-auth'

const app = new Hono<AppContext>()

app.get('/:eventId', async (c) => {
  const eventId = c.req.param('eventId')
  const log = c.get('logger')

  if (!eventId) {
    return c.json({ error: 'Event ID required', code: 'VALIDATION_ERROR' }, 400)
  }

  try {
    const db = (await import('@libsql/client')).createClient({
      url: c.env.TURSO_URL,
      authToken: c.env.TURSO_TOKEN,
    })

    const result = await db.execute({
      sql: 'SELECT invite_token, organizer_token_hash FROM events WHERE id = ?',
      args: [eventId],
    })

    if (result.rows.length === 0) {
      log.warn('qr: event not found', { eventId })
      return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
    }

    const row = result.rows[0] as Record<string, unknown>
    if (!(await verifyOrganizerToken(c.req.header('authorization'), row.organizer_token_hash))) {
      return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
    }

    const inviteToken = row.invite_token
    if (typeof inviteToken !== 'string' || inviteToken.length === 0) {
      return c.json({ error: 'Event invite is unavailable', code: 'INVITE_UNAVAILABLE' }, 503)
    }
    const url = `https://grabpic.app/e/${inviteToken}`

    const qrcode = await import('qrcode')
    const svg = await qrcode.toString(url, { type: 'svg', width: 400, margin: 2 })

    c.header('Content-Type', 'image/svg+xml')
    c.header('Cache-Control', 'public, max-age=3600')
    return c.body(svg)
  } catch (err) {
    log.error('qr: generation error', { eventId, error: String(err) })
    return c.json({ error: 'Failed to generate QR code', code: 'INTERNAL_ERROR' }, 500)
  }
})

export { app as qr }
