import type { Doc } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { appError } from './errors'
import { timingSafeEqual } from './validation'

export async function eventByPublicId(
  ctx: Pick<QueryCtx, 'db'>,
  publicId: string,
): Promise<Doc<'events'> | null> {
  return await ctx.db
    .query('events')
    .withIndex('by_public_id', (query) => query.eq('publicId', publicId))
    .unique()
}

export function requireOrganizer(event: Doc<'events'>, organizerTokenHash: string): void {
  if (
    organizerTokenHash.length !== 64 ||
    !timingSafeEqual(event.organizerTokenHash, organizerTokenHash)
  ) {
    appError('UNAUTHORIZED')
  }
}

export function requireActiveEvent(event: Doc<'events'>, now: number): void {
  if (event.status === 'deleting') appError('EVENT_DELETING')
  if (event.status === 'expired' || event.expiresAt <= now) appError('EVENT_EXPIRED')
}
