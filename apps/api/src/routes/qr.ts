import { Hono } from 'hono'
import { api } from '../../convex/_generated/api'
import type { AppContext } from '../index'
import { createConvexClient, hasConvexError } from '../lib/convex'
import { hashOrganizerAuthorization } from '../lib/organizer-auth'

const app = new Hono<AppContext>()

app.get('/:eventId', async (c) => {
  const eventId = c.req.param('eventId')
  const log = c.get('logger')

  if (!eventId) {
    return c.json({ error: 'Event ID required', code: 'VALIDATION_ERROR' }, 400)
  }

  try {
    const organizerTokenHash = await hashOrganizerAuthorization(c.req.header('authorization'))
    if (!organizerTokenHash) {
      return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
    }
    const event = await createConvexClient(c.env).query(api.events.getOrganizerEvent, {
      serviceSecret: c.env.CONVEX_SERVICE_SECRET,
      publicId: eventId,
      organizerTokenHash,
    })
    if (!event) {
      log.warn('qr: event not found', { eventId })
      return c.json({ error: 'Event not found', code: 'NOT_FOUND' }, 404)
    }

    if (!event.inviteToken) {
      return c.json({ error: 'Event invite is unavailable', code: 'INVITE_UNAVAILABLE' }, 503)
    }
    const url = `https://grabpic.app/e/${event.inviteToken}`

    const qrcode = await import('qrcode')
    const svg = await qrcode.toString(url, { type: 'svg', width: 400, margin: 2 })

    c.header('Content-Type', 'image/svg+xml')
    c.header('Cache-Control', 'public, max-age=3600')
    return c.body(svg)
  } catch (err) {
    if (hasConvexError(err, 'UNAUTHORIZED')) {
      return c.json({ error: 'Organizer authorization required', code: 'UNAUTHORIZED' }, 401)
    }
    log.error('qr: generation error', { eventId, error: String(err) })
    return c.json({ error: 'Failed to generate QR code', code: 'INTERNAL_ERROR' }, 500)
  }
})

export { app as qr }
