import type { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'

interface ObjectStore {
  delete(keys: string | string[]): Promise<void>
  list(options: { prefix: string; cursor?: string }): Promise<{
    objects: Array<{ key: string }>
    truncated: boolean
    cursor?: string
  }>
}

interface Logger {
  info(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

interface SentryReporter {
  captureMessage(message: string, meta?: Record<string, unknown>): void
}

export interface CleanupResult {
  deleted: boolean
  photosDeleted: number
  storageFreed: number
  objectsDeleted: number
  failedKeys: string[]
}

export interface CleanupExpiredEventsResult {
  expiredEvents: number
  deletedEvents: number
  failedEvents: string[]
}

interface CleanupEventResourcesOptions {
  client: Pick<ConvexHttpClient, 'query' | 'mutation'>
  serviceSecret: string
  bucket: ObjectStore
  eventId: string
  cancelModalJob: (modalJobId: string) => Promise<void>
  log?: Logger
  sentry?: SentryReporter
}

interface CleanupExpiredEventsOptions {
  client: Pick<ConvexHttpClient, 'query' | 'mutation'>
  serviceSecret: string
  bucket: ObjectStore
  cancelModalJob: (modalJobId: string) => Promise<void>
  now?: number
  log?: Logger
  sentry?: SentryReporter
}

export async function cleanupEventResources({
  client,
  serviceSecret,
  bucket,
  eventId,
  cancelModalJob,
  log,
  sentry,
}: CleanupEventResourcesOptions): Promise<CleanupResult | null> {
  const state = await client.query(api.deletion.getState, {
    serviceSecret,
    eventPublicId: eventId,
  })
  if (!state) return null

  if (state.modalJobId) {
    try {
      await cancelModalJob(state.modalJobId)
      await client.mutation(api.deletion.markModalCancelled, {
        serviceSecret,
        eventPublicId: eventId,
        now: Math.floor(Date.now() / 1000),
      })
    } catch {
      await recordFailure(client, serviceSecret, eventId, 'Modal cancellation failed')
      log?.error('event: Modal cancellation failed', { eventId })
      sentry?.captureMessage('Event Modal cancellation failed', { eventId })
      return failureResult(state, [], 0)
    }
  }

  const eventPrefix = `events/${eventId}/`
  const objectKeys = new Set(state.objectKeys)
  try {
    let cursor: string | undefined
    while (true) {
      const page = await bucket.list({
        prefix: eventPrefix,
        ...(cursor ? { cursor } : {}),
      })
      for (const object of page.objects) objectKeys.add(object.key)
      if (!page.truncated) break
      if (!page.cursor || page.cursor === cursor) throw new Error('R2_LIST_STALLED')
      cursor = page.cursor
    }
  } catch {
    await recordFailure(client, serviceSecret, eventId, 'R2 asset listing failed')
    log?.error('event: R2 asset listing failed', { eventId })
    sentry?.captureMessage('Event R2 asset listing failed', { eventId })
    return failureResult(state, [...objectKeys], 0)
  }

  const allObjectKeys = [...objectKeys]
  const batches = chunk(allObjectKeys, 1000)
  const deletionResults = await Promise.allSettled(batches.map((keys) => bucket.delete(keys)))
  const failedKeys = deletionResults.flatMap((result, index) =>
    result.status === 'rejected' ? batches[index] : [],
  )
  if (failedKeys.length > 0) {
    await recordFailure(client, serviceSecret, eventId, 'R2 asset deletion failed')
    log?.error('event: R2 asset deletion failed', { eventId, failedKeys })
    sentry?.captureMessage('Event R2 asset deletion failed', { eventId, failedKeys })
    return failureResult(state, failedKeys, allObjectKeys.length - failedKeys.length)
  }

  try {
    while (true) {
      const result = await client.mutation(api.deletion.purgeBatch, {
        serviceSecret,
        eventPublicId: eventId,
      })
      if (result.eventDeleted) break
      if (result.deletedRecords === 0) throw new Error('PURGE_STALLED')
    }
  } catch {
    await recordFailure(client, serviceSecret, eventId, 'Convex purge failed')
    log?.error('event: Convex purge failed', { eventId })
    sentry?.captureMessage('Event Convex purge failed', { eventId })
    return failureResult(state, [], state.objectKeys.length)
  }

  log?.info('event: cleanup complete', {
    eventId,
    photosDeleted: state.photoCount,
    objectsDeleted: allObjectKeys.length,
    storageFreed: state.storageBytes,
  })
  return {
    deleted: true,
    photosDeleted: state.photoCount,
    storageFreed: state.storageBytes,
    objectsDeleted: allObjectKeys.length,
    failedKeys: [],
  }
}

export async function cleanupExpiredEvents({
  client,
  serviceSecret,
  bucket,
  cancelModalJob,
  now = Math.floor(Date.now() / 1000),
  log,
  sentry,
}: CleanupExpiredEventsOptions): Promise<CleanupExpiredEventsResult> {
  const eventIds = await client.query(api.deletion.listCandidates, { serviceSecret, now })
  const failedEvents: string[] = []
  let deletedEvents = 0

  for (const eventId of eventIds) {
    try {
      await client.mutation(api.deletion.beginExpired, {
        serviceSecret,
        eventPublicId: eventId,
        now,
      })
      const result = await cleanupEventResources({
        client,
        serviceSecret,
        bucket,
        eventId,
        cancelModalJob,
        log,
        sentry,
      })
      if (result?.deleted) deletedEvents += 1
      else failedEvents.push(eventId)
    } catch {
      failedEvents.push(eventId)
      log?.error('cron: event cleanup failed', { eventId })
      sentry?.captureMessage('Expired event cleanup failed', { eventId })
    }
  }

  log?.info('cron: expired event cleanup run complete', {
    scannedEvents: eventIds.length,
    deletedEvents,
    failedEvents,
  })
  return { expiredEvents: eventIds.length, deletedEvents, failedEvents }
}

async function recordFailure(
  client: Pick<ConvexHttpClient, 'mutation'>,
  serviceSecret: string,
  eventId: string,
  sanitizedError: string,
): Promise<void> {
  await client.mutation(api.deletion.recordFailure, {
    serviceSecret,
    eventPublicId: eventId,
    sanitizedError,
    now: Math.floor(Date.now() / 1000),
  })
}

function failureResult(
  state: { photoCount: number; storageBytes: number; objectKeys: string[] },
  failedKeys: string[],
  objectsDeleted: number,
): CleanupResult {
  return {
    deleted: false,
    photosDeleted: state.photoCount,
    storageFreed: state.storageBytes,
    objectsDeleted,
    failedKeys,
  }
}

function chunk<T>(values: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size))
  }
  return batches
}
