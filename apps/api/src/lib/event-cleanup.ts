import type { Client, InStatement } from '@libsql/client'
import { createDbClient } from '@grabpic/db'

interface ObjectStore {
  delete(key: string): Promise<void>
}

interface Logger {
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

interface SentryReporter {
  captureException(err: unknown, meta?: Record<string, unknown>): void
}

interface PhotoAssetRow {
  id: string
  r2Key: string | null
  thumbnail200Key: string | null
  thumbnail800Key: string | null
  fileSize: number | null
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
  db: Pick<Client, 'execute'>
  bucket: ObjectStore
  eventId: string
  log?: Logger
  sentry?: SentryReporter
}

interface CleanupExpiredEventsOptions {
  url: string
  authToken: string
  bucket: ObjectStore
  now?: number
  log?: Logger
  sentry?: SentryReporter
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0) || 0
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function mapPhotoRow(row: Record<string, unknown>): PhotoAssetRow {
  return {
    id: String(row.id),
    r2Key: toStringOrNull(row.r2_key),
    thumbnail200Key: toStringOrNull(row.thumbnail_200_key),
    thumbnail800Key: toStringOrNull(row.thumbnail_800_key),
    fileSize: row.file_size == null ? null : toNumber(row.file_size),
  }
}

export function extractEventObjectKeys(photos: PhotoAssetRow[]): string[] {
  const keys = new Set<string>()

  for (const photo of photos) {
    for (const key of [photo.r2Key, photo.thumbnail200Key, photo.thumbnail800Key]) {
      if (key) keys.add(key)
    }
  }

  return [...keys]
}

export async function cleanupEventResources({
  db,
  bucket,
  eventId,
  log,
  sentry,
}: CleanupEventResourcesOptions): Promise<CleanupResult | null> {
  const eventResult = await db.execute({
    sql: 'SELECT id FROM events WHERE id = ?',
    args: [eventId],
  })

  if (eventResult.rows.length === 0) {
    return null
  }

  const photosResult = await db.execute({
    sql: `SELECT id, r2_key, thumbnail_200_key, thumbnail_800_key, file_size
          FROM photos
          WHERE event_id = ?`,
    args: [eventId],
  })

  const photos = photosResult.rows.map((row) => mapPhotoRow(row as Record<string, unknown>))
  const objectKeys = extractEventObjectKeys(photos)
  const recordedBytes = photos.reduce((total, photo) => total + (photo.fileSize ?? 0), 0)
  const storageFreed = recordedBytes > 0 ? recordedBytes : photos.length * 5 * 1024 * 1024

  const objectDeletionResults = await Promise.allSettled(
    objectKeys.map(async (key) => {
      await bucket.delete(key)
      return key
    }),
  )

  const failedKeys = objectDeletionResults.flatMap((result, index) =>
    result.status === 'rejected' ? [objectKeys[index]] : [],
  )

  if (failedKeys.length > 0) {
    log?.error('event: cleanup asset deletion failed', {
      eventId,
      failedKeys,
    })
    sentry?.captureException(new Error('Failed to delete one or more event objects'), {
      eventId,
      failedKeys,
    })

    return {
      deleted: false,
      photosDeleted: photos.length,
      storageFreed,
      objectsDeleted: objectKeys.length - failedKeys.length,
      failedKeys,
    }
  }

  const deleteStatements: InStatement[] = [
    {
      sql: `DELETE FROM face_embeddings
            WHERE face_id IN (
              SELECT f.id
              FROM faces f
              INNER JOIN photos p ON p.id = f.photo_id
              WHERE p.event_id = ?
            )`,
      args: [eventId],
    },
    {
      sql: `DELETE FROM faces
            WHERE photo_id IN (
              SELECT id
              FROM photos
              WHERE event_id = ?
            )`,
      args: [eventId],
    },
    {
      sql: 'DELETE FROM match_sessions WHERE event_id = ?',
      args: [eventId],
    },
    {
      sql: 'DELETE FROM photos WHERE event_id = ?',
      args: [eventId],
    },
    {
      sql: 'DELETE FROM events WHERE id = ?',
      args: [eventId],
    },
  ]

  for (const statement of deleteStatements) {
    await db.execute(statement)
  }

  log?.info('event: cleanup complete', {
    eventId,
    photosDeleted: photos.length,
    objectsDeleted: objectKeys.length,
    storageFreed,
  })

  return {
    deleted: true,
    photosDeleted: photos.length,
    storageFreed,
    objectsDeleted: objectKeys.length,
    failedKeys: [],
  }
}

export async function cleanupExpiredEvents({
  url,
  authToken,
  bucket,
  now = Math.floor(Date.now() / 1000),
  log,
  sentry,
}: CleanupExpiredEventsOptions): Promise<CleanupExpiredEventsResult> {
  const db = createDbClient(url, authToken)
  const expiredEventsResult = await db.execute({
    sql: `SELECT id
          FROM events
          WHERE expires_at <= ?
          ORDER BY expires_at ASC
          LIMIT 100`,
    args: [now],
  })

  const eventIds = expiredEventsResult.rows.map((row) => String((row as Record<string, unknown>).id))
  const failedEvents: string[] = []
  let deletedEvents = 0

  for (const eventId of eventIds) {
    const result = await cleanupEventResources({ db, bucket, eventId, log, sentry })
    if (result?.deleted) {
      deletedEvents += 1
      continue
    }

    if (result) {
      failedEvents.push(eventId)
    }
  }

  log?.info('cron: expired event cleanup run complete', {
    scannedEvents: eventIds.length,
    deletedEvents,
    failedEvents,
  })

  return {
    expiredEvents: eventIds.length,
    deletedEvents,
    failedEvents,
  }
}
