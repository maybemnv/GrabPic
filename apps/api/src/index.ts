import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { events } from './routes/events'
import { match } from './routes/match'
import { upload } from './routes/upload'
import { createLogger } from './lib/logger'
import { createSentryReporter } from './lib/sentry'

const app = new Hono<{ Bindings: Env }>()

app.use('/*', cors())

app.use('*', async (c, next) => {
  const start = Date.now()
  c.set('logger', createLogger(c.env.LOG_LEVEL))
  c.set('sentry', createSentryReporter(c.env.SENTRY_DSN))
  await next()
  const ms = Date.now() - start
  const log = c.get('logger') as ReturnType<typeof createLogger>
  log.info(`${c.req.method} ${c.req.url}`, { status: c.res.status, duration: ms })
})

app.onError((err, c) => {
  const sentry = c.get('sentry') as ReturnType<typeof createSentryReporter>
  sentry.captureException(err, { path: c.req.url, method: c.req.method })
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
})

app.route('/events', events)
app.route('/events/:eventId/match', match)
app.route('/events/:eventId/upload', upload)

app.get('/health', (c) => c.json({ status: 'ok' }))

app.get('/health/processing', async (c) => {
  try {
    const db = (await import('@libsql/client')).createClient({
      url: c.env.TURSO_URL,
      authToken: c.env.TURSO_TOKEN,
    })
    await db.execute('SELECT 1')
    return c.json({ status: 'ok', database: 'connected' })
  } catch {
    return c.json({ status: 'error', database: 'disconnected' }, 503)
  }
})

export default app

export interface Env {
  PHOTOS: R2Bucket
  LOG_LEVEL: string
  SENTRY_DSN: string
  MODAL_TOKEN: string
  MODAL_WEBHOOK_URL: string
  TURSO_URL: string
  TURSO_TOKEN: string
}
