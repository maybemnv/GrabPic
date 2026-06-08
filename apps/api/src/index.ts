import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { events } from './routes/events'
import { match } from './routes/match'
import { upload } from './routes/upload'

const app = new Hono<{ Bindings: Env }>()

app.use('/*', cors())
app.use('*', logger())

app.route('/events', events)
app.route('/events/:eventId/match', match)
app.route('/events/:eventId/upload', upload)

app.get('/health', (c) => c.json({ status: 'ok' }))

export default app

export interface Env {
  PHOTOS: R2Bucket
  LOG_LEVEL: string
  MODAL_TOKEN: string
  MODAL_WEBHOOK_URL: string
  TURSO_URL: string
  TURSO_TOKEN: string
}
