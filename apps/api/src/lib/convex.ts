import { ConvexHttpClient } from 'convex/browser'
import type { Env } from '../index'

export function createConvexClient(env: Pick<Env, 'CONVEX_URL'>): ConvexHttpClient {
  return new ConvexHttpClient(env.CONVEX_URL, { logger: false })
}

export function hasConvexError(error: unknown, code: string): boolean {
  if (!code) return false
  const data = (error as { data?: unknown } | null)?.data
  if (matchesStructuredCode(data, code)) return true

  const message =
    error instanceof Error ? error.message.trim() : typeof error === 'string' ? error.trim() : ''
  return message === code
}

function matchesStructuredCode(value: unknown, code: string): boolean {
  if (value == null) return false
  if (typeof value === 'string') {
    if (value === code) return true
    try {
      return matchesStructuredCode(JSON.parse(value), code)
    } catch {
      return false
    }
  }
  if (typeof value !== 'object') return false
  const record = value as { code?: unknown; error?: unknown }
  return record.code === code || matchesStructuredCode(record.error, code)
}
