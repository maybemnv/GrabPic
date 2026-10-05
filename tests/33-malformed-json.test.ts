import { describe, expect, it, vi } from 'vitest'
import worker, { type Env } from '../apps/api/src/index'

const env = {
  LOG_LEVEL: 'error',
  RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) } as unknown as RateLimit,
} as Env

async function post(path: string, body: string) {
  return worker.fetch!(
    new Request(`https://api.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${'a'.repeat(64)}` },
      body,
    }),
    env,
    { waitUntil: () => {} } as unknown as ExecutionContext,
  )
}

describe('malformed JSON bodies', () => {
  it.each(['/events', '/events/lookup', '/events/evt_1/match'])(
    '%s answers 400 VALIDATION_ERROR, not 500',
    async (path) => {
      const response = await post(path, '{not json')
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
    },
  )
})
