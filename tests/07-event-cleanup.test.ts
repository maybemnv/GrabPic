import { describe, expect, it, vi } from 'vitest'
import { cleanupEventResources, extractEventObjectKeys } from '../apps/api/src/lib/event-cleanup'

type Statement = string | { sql: string; args?: unknown[] }

function getSql(statement: Statement): string {
  return typeof statement === 'string' ? statement : statement.sql
}

describe('event cleanup', () => {
  it('deduplicates original and thumbnail object keys', () => {
    const keys = extractEventObjectKeys([
      {
        id: 'photo_1',
        r2Key: 'events/evt_1/photo_1.jpg',
        thumbnail200Key: 'events/evt_1/thumbs/200/photo_1.jpg',
        thumbnail800Key: 'events/evt_1/thumbs/800/photo_1.jpg',
        fileSize: 123,
      },
      {
        id: 'photo_2',
        r2Key: 'events/evt_1/photo_2.jpg',
        thumbnail200Key: null,
        thumbnail800Key: 'events/evt_1/thumbs/800/photo_2.jpg',
        fileSize: 456,
      },
      {
        id: 'photo_3',
        r2Key: 'events/evt_1/photo_2.jpg',
        thumbnail200Key: null,
        thumbnail800Key: null,
        fileSize: null,
      },
    ])

    expect(keys).toEqual([
      'events/evt_1/photo_1.jpg',
      'events/evt_1/thumbs/200/photo_1.jpg',
      'events/evt_1/thumbs/800/photo_1.jpg',
      'events/evt_1/photo_2.jpg',
      'events/evt_1/thumbs/800/photo_2.jpg',
    ])
  })

  it('deletes bucket objects before removing event rows', async () => {
    const executedSql: string[] = []
    const deletedKeys: string[] = []

    const db = {
      execute: vi.fn(async (statement: Statement) => {
        const sql = getSql(statement)
        executedSql.push(sql)

        if (sql.startsWith('SELECT id FROM events')) {
          return { rows: [{ id: 'evt_123' }] }
        }

        if (sql.startsWith('SELECT id, r2_key')) {
          return {
            rows: [
              {
                id: 'photo_1',
                r2_key: 'events/evt_123/photo_1.jpg',
                thumbnail_200_key: 'events/evt_123/thumbs/200/photo_1.jpg',
                thumbnail_800_key: 'events/evt_123/thumbs/800/photo_1.jpg',
                file_size: 200,
              },
            ],
          }
        }

        return { rows: [] }
      }),
    }

    const bucket = {
      delete: vi.fn(async (key: string) => {
        deletedKeys.push(key)
      }),
    }

    const result = await cleanupEventResources({
      db,
      bucket,
      eventId: 'evt_123',
    })

    expect(result).toEqual({
      deleted: true,
      photosDeleted: 1,
      storageFreed: 200,
      objectsDeleted: 3,
      failedKeys: [],
    })
    expect(deletedKeys).toEqual([
      'events/evt_123/photo_1.jpg',
      'events/evt_123/thumbs/200/photo_1.jpg',
      'events/evt_123/thumbs/800/photo_1.jpg',
    ])
    expect(executedSql.slice(2)).toEqual([
      expect.stringContaining('DELETE FROM face_embeddings'),
      expect.stringContaining('DELETE FROM faces'),
      'DELETE FROM match_sessions WHERE event_id = ?',
      'DELETE FROM photos WHERE event_id = ?',
      'DELETE FROM events WHERE id = ?',
    ])
  })

  it('keeps database rows intact when bucket deletion fails', async () => {
    const executedSql: string[] = []

    const db = {
      execute: vi.fn(async (statement: Statement) => {
        const sql = getSql(statement)
        executedSql.push(sql)

        if (sql.startsWith('SELECT id FROM events')) {
          return { rows: [{ id: 'evt_123' }] }
        }

        if (sql.startsWith('SELECT id, r2_key')) {
          return {
            rows: [
              {
                id: 'photo_1',
                r2_key: 'events/evt_123/photo_1.jpg',
                thumbnail_200_key: null,
                thumbnail_800_key: null,
                file_size: 0,
              },
            ],
          }
        }

        return { rows: [] }
      }),
    }

    const bucket = {
      delete: vi.fn(async () => {
        throw new Error('boom')
      }),
    }

    const result = await cleanupEventResources({
      db,
      bucket,
      eventId: 'evt_123',
    })

    expect(result).toEqual({
      deleted: false,
      photosDeleted: 1,
      storageFreed: 5 * 1024 * 1024,
      objectsDeleted: 0,
      failedKeys: ['events/evt_123/photo_1.jpg'],
    })
    expect(executedSql).toHaveLength(2)
  })
})
