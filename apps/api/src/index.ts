import { Hono, type MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
import { api } from '../convex/_generated/api'
import { events } from './routes/events'
import { match } from './routes/match'
import { upload } from './routes/upload'
import { qr } from './routes/qr'
import { processorCallback } from './routes/processor-callback'
import { createLogger, sanitizeRequestPath } from './lib/logger'
import { createSentryReporter } from './lib/sentry'
import { cleanupExpiredEvents } from './lib/event-cleanup'
import { createConvexClient, hasConvexError } from './lib/convex'
import { requestProcessingAcceptance, requestProcessingCancellation } from './lib/processor'
import type { ProcessingRequest } from './lib/processor'

type ProcessingDispatch = Pick<ProcessingRequest, 'job_id' | 'event_id' | 'attempt'>

export interface Env {
  PHOTOS: R2Bucket
  R2_ENDPOINT: string
  R2_BUCKET: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
  RATE_LIMITER: RateLimit
  LOG_LEVEL: string
  SENTRY_DSN: string
  PROCESSOR_TOKEN: string
  PROCESSOR_CALLBACK_TOKEN: string
  PROCESSOR_WEBHOOK_URL: string
  PROCESSOR_CANCEL_URL: string
  PROCESSOR_EMBEDDING_URL: string
  PROCESSING_QUEUE: Queue<ProcessingDispatch>
  MATCH_THRESHOLD: string
  CONVEX_URL: string
  CONVEX_SERVICE_SECRET: string
  CORS_ORIGINS?: string
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

const defaultOrigins = ['https://grabpic.app', 'http://localhost:3000', 'http://127.0.0.1:3000']

// CORS_ORIGINS (comma-separated, exact origins) lets a Pages *.pages.dev or preview
// origin call the API without a code change.
const browserCors: MiddlewareHandler<AppContext> = (c, next) => {
  const extra = (c.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  const allowed = [...defaultOrigins, ...extra]
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })(c, next)
}

app.use('/events', browserCors)
app.use('/events/*', browserCors)
app.use('/health', browserCors)
app.use('/health/*', browserCors)
app.use('/qr', browserCors)
app.use('/qr/*', browserCors)

app.use('*', async (c, next) => {
  const start = Date.now()
  c.set('logger', createLogger(c.env.LOG_LEVEL))
  c.set(
    'sentry',
    createSentryReporter(c.env.SENTRY_DSN, (promise) => {
      try {
        c.executionCtx.waitUntil(promise)
      } catch {
        // No execution context (unit tests); the report stays best-effort.
      }
    }),
  )
  await next()
  const ms = Date.now() - start
  const log = c.get('logger')
  log.info(`${c.req.method} ${sanitizeRequestPath(c.req.url)}`, {
    status: c.res.status,
    duration: ms,
  })
})

app.onError((err, c) => {
  const sentry = c.get('sentry')
  sentry.captureException(err, { path: sanitizeRequestPath(c.req.url), method: c.req.method })
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
})

app.route('/events', events)
app.route('/events/:eventId/match', match)
app.route('/events/:eventId/upload', upload)
app.route('/qr', qr)
app.route('/internal/processor', processorCallback)

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
  const sentry = createSentryReporter(env.SENTRY_DSN, (promise) => ctx.waitUntil(promise))

  ctx.waitUntil(
    (async () => {
      try {
        const client = createConvexClient(env)
        await cleanupExpiredEvents({
          client,
          serviceSecret: env.CONVEX_SERVICE_SECRET,
          bucket: env.PHOTOS,
          cancelModalJob: (modalJobId) =>
            requestProcessingCancellation(
              env.PROCESSOR_CANCEL_URL,
              env.PROCESSOR_TOKEN,
              modalJobId,
            ),
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

const DEAD_LETTER_QUEUE = 'grabpic-processing-dead'

// A job that exhausted its delivery retries would otherwise sit in "processing"
// forever. Marking it failed surfaces it to the organizer, who can retry through
// the normal upload confirmation path.
const failAbandonedJobs = async (
  batch: MessageBatch<ProcessingDispatch>,
  env: Env,
  convex: ReturnType<typeof createConvexClient>,
  ctx: ExecutionContext,
) => {
  const sentry = createSentryReporter(env.SENTRY_DSN, (promise) => ctx.waitUntil(promise))
  for (const message of batch.messages) {
    const { event_id, job_id, attempt } = message.body
    try {
      await convex.mutation(api.processing.markProcessingFailed, {
        serviceSecret: env.CONVEX_SERVICE_SECRET,
        eventPublicId: event_id,
        jobPublicId: job_id,
        attempt,
        sanitizedError: 'Processing could not be dispatched',
        now: Math.floor(Date.now() / 1000),
      })
      sentry.captureMessage('Processing job abandoned after queue retries', { event_id, job_id })
      message.ack()
    } catch (error) {
      const settled = ['EVENT_NOT_FOUND', 'EVENT_DELETING', 'JOB_NOT_FOUND', 'STALE_JOB'].some(
        (code) => hasConvexError(error, code),
      )
      if (settled) message.ack()
      // Back off up to an hour so a long Convex outage does not exhaust the retries.
      else message.retry({ delaySeconds: Math.min(60 * (message.attempts ?? 1), 3600) })
    }
  }
}

const queue: ExportedHandlerQueueHandler<Env, ProcessingDispatch> = async (batch, env, ctx) => {
  const convex = createConvexClient(env)
  if (batch.queue === DEAD_LETTER_QUEUE) return failAbandonedJobs(batch, env, convex, ctx)
  for (const message of batch.messages) {
    const request = message.body
    try {
      const state = await convex.query(api.processing.getDispatchState, {
        serviceSecret: env.CONVEX_SERVICE_SECRET,
        eventPublicId: request.event_id,
        jobPublicId: request.job_id,
        attempt: request.attempt,
      })
      if (state.state === 'gone') {
        message.ack()
        continue
      }
      if (state.state === 'pending') {
        message.retry({ delaySeconds: 10 })
        continue
      }
      const acceptedId = await requestProcessingAcceptance(
        env.PROCESSOR_WEBHOOK_URL,
        env.PROCESSOR_TOKEN,
        { ...request, photos: state.photos },
      )
      if (acceptedId !== request.job_id) throw new Error('Processor returned a different job ID')
      message.ack()
    } catch {
      message.retry({ delaySeconds: 30 })
    }
  }
}

export default {
  fetch: app.fetch,
  scheduled,
  queue,
}
