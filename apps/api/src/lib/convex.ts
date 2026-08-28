import { ConvexHttpClient } from 'convex/browser'
import type { Env } from '../index'

export function createConvexClient(env: Pick<Env, 'CONVEX_URL'>): ConvexHttpClient {
  return new ConvexHttpClient(env.CONVEX_URL, { logger: false })
}

export function hasConvexError(error: unknown, code: string): boolean {
  return String(error).includes(code)
}
