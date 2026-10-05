import { describe, expect, it } from 'vitest'
import worker, { type Env } from '../apps/api/src/index'

async function preflight(origin: string, env: Partial<Env>) {
  const response = await worker.fetch!(
    new Request('https://api.test/health', {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'GET' },
    }),
    { LOG_LEVEL: 'error', ...env } as Env,
    { waitUntil: () => {} } as unknown as ExecutionContext,
  )
  return response.headers.get('access-control-allow-origin')
}

describe('Worker CORS origins', () => {
  it('allows the default origins', async () => {
    expect(await preflight('https://grabpic.app', {})).toBe('https://grabpic.app')
  })

  it('rejects an unknown origin by default', async () => {
    expect(await preflight('https://grabpic.pages.dev', {})).toBeNull()
  })

  it('allows origins listed in CORS_ORIGINS and nothing else', async () => {
    const env = { CORS_ORIGINS: 'https://grabpic.pages.dev, https://preview.grabpic.pages.dev' }
    expect(await preflight('https://grabpic.pages.dev', env)).toBe('https://grabpic.pages.dev')
    expect(await preflight('https://preview.grabpic.pages.dev', env)).toBe(
      'https://preview.grabpic.pages.dev',
    )
    expect(await preflight('https://evil.example', env)).toBeNull()
  })
})
