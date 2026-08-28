import { ConvexHttpClient } from 'convex/browser'
import type { Env } from '../index'

export function createConvexClient(env: Pick<Env, 'CONVEX_URL'>): ConvexHttpClient {
  return new ConvexHttpClient(env.CONVEX_URL, { logger: false })
}

export function hasConvexError(error: unknown, code: string): boolean {
  return Boolean(code) && convexErrorCode(error) === code
}

export function convexErrorCode(error: unknown): string | undefined {
  const data = (error as { data?: unknown } | null)?.data
  if (typeof data === 'object' && data !== null && 'code' in data) {
    const code = (data as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  if (typeof data === 'string') {
    if (/^[A-Z][A-Z0-9_]*$/.test(data)) return data
    try {
      return convexErrorCode({ data: JSON.parse(data) })
    } catch {
      return undefined
    }
  }

  const message =
    error instanceof Error ? error.message.trim() : typeof error === 'string' ? error.trim() : ''
  return /^[A-Z][A-Z0-9_]*$/.test(message) ? message : undefined
}
