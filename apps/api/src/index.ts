import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { events } from './routes/events'
import { match } from './routes/match'
import { upload } from './routes/upload'
import { qr } from './routes/qr'
import { createLogger } from './lib/logger'
import { createSentryReporter } from './lib/sentry'
import { cleanupExpiredEvents } from './lib/event-cleanup'

export interface Env {
  PHOTOS: R2Bucket
  LOG_LEVEL: string
  SENTRY_DSN: string
  MODAL_TOKEN: string
  MODAL_WEBHOOK_URL: string
  TURSO_URL: string
  TURSO_TOKEN: string
}

export interface AppVariables {
  logger: ReturnType<typeof createLogger>
  sentry: ReturnType<typeof createSentryReporter>
}

export type AppContext = {
  Bindings: Env
  Variables: AppVariables
}

const app = new Hono<AppContext>()

app.use('/*', cors())

app.use('*', async (c, next) => {
  const start = Date.now()
  c.set('logger', createLogger(c.env.LOG_LEVEL))
  c.set('sentry', createSentryReporter(c.env.SENTRY_DSN))
  await next()
  const ms = Date.now() - start
  const log = c.get('logger')
  log.info(`${c.req.method} ${c.req.url}`, { status: c.res.status, duration: ms })
})

app.onError((err, c) => {
  const sentry = c.get('sentry')
  sentry.captureException(err, { path: c.req.url, method: c.req.method })
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
})

app.route('/events', events)
app.route('/events/:eventId/match', match)
app.route('/events/:eventId/upload', upload)
app.route('/qr', qr)

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

const scheduled: ExportedHandlerScheduledHandler<Env> = async (controller, env, ctx) => {
  const log = createLogger(env.LOG_LEVEL)
  const sentry = createSentryReporter(env.SENTRY_DSN)

  ctx.waitUntil(
    (async () => {
      try {
        await cleanupExpiredEvents({
          url: env.TURSO_URL,
          authToken: env.TURSO_TOKEN,
          bucket: env.PHOTOS,
          log,
          sentry,
        })
      } catch (err) {
        log.error('cron: expired event cleanup failed', {
          cron: controller.cron,
          scheduledTime: controller.scheduledTime,
          error: String(err),
        })
        sentry.captureException(err, {
          cron: controller.cron,
          scheduledTime: controller.scheduledTime,
        })
      }
    })(),
  )
}

export default {
  fetch: app.fetch,
  scheduled,
}
