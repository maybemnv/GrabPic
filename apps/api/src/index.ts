import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { api } from '../convex/_generated/api'
import { events } from './routes/events'
import { match } from './routes/match'
import { upload } from './routes/upload'
import { qr } from './routes/qr'
import { modalCallback } from './routes/modal-callback'
import { createLogger } from './lib/logger'
import { createSentryReporter } from './lib/sentry'
import { cleanupExpiredEvents } from './lib/event-cleanup'
import { createConvexClient } from './lib/convex'
import { requestProcessingCancellation } from './lib/modal'

export interface Env {
  PHOTOS: R2Bucket
  R2_ENDPOINT: string
  R2_BUCKET: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
  RATE_LIMITER: RateLimit
  LOG_LEVEL: string
  SENTRY_DSN: string
  MODAL_TOKEN: string
  MODAL_CALLBACK_TOKEN: string
  MODAL_WEBHOOK_URL: string
  MODAL_CANCEL_URL: string
  MODAL_EMBEDDING_URL: string
  MATCH_THRESHOLD: string
  CONVEX_URL: string
  CONVEX_SERVICE_SECRET: string
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
app.route('/internal/modal', modalCallback)

app.get('/health', (c) => c.json({ status: 'ok' }))

app.get('/health/processing', async (c) => {
  try {
    await createConvexClient(c.env).query(api.system.health, {
      serviceSecret: c.env.CONVEX_SERVICE_SECRET,
    })
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
        const client = createConvexClient(env)
        await cleanupExpiredEvents({
          client,
          serviceSecret: env.CONVEX_SERVICE_SECRET,
          bucket: env.PHOTOS,
          cancelModalJob: (modalJobId) =>
            requestProcessingCancellation(env.MODAL_CANCEL_URL, env.MODAL_TOKEN, modalJobId),
          log,
          sentry,
        })
      } catch {
        log.error('cron: expired event cleanup failed', {
          cron: controller.cron,
          scheduledTime: controller.scheduledTime,
        })
        sentry.captureMessage('Expired event cleanup run failed', {
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
