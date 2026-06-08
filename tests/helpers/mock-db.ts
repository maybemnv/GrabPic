import type { ResultSet } from '@libsql/client'

type Row = Record<string, unknown>
type Sql = string
type Args = unknown[]

interface Statement {
  sql: Sql
  args: Args
}

export function createMockDb() {
  const tables: Record<string, Row[]> = {
    events: [],
    photos: [],
    faces: [],
    face_embeddings: [],
  }
  let idCounter = 0

  function execute(stmt: Statement | Sql, args?: Args): Promise<ResultSet> {
    const sql = typeof stmt === 'string' ? stmt : stmt.sql
    const params = typeof stmt === 'string' ? (args ?? []) : stmt.args

    if (sql.toUpperCase().includes('INSERT')) {
      idCounter++
      return Promise.resolve({
        rows: [],
        rowsAffected: 1,
        lastInsertRowid: BigInt(idCounter),
        columns: [],
        columnTypes: [],
      })
    }

    if (sql.toUpperCase().includes('SELECT')) {
      const tableName = Object.keys(tables).find((t) => sql.toLowerCase().includes(t))
      const rows = tableName ? tables[tableName] : []

      if (sql.includes('WHERE id = ?') && params[0]) {
        const filtered = rows.filter((r) => r.id === params[0])

        if (sql.includes('photo_count')) {
          return Promise.resolve({
            rows: filtered.length > 0 ? filtered : [],
            rowsAffected: 0,
            lastInsertRowid: null,
            columns: ['photo_count', 'face_count', 'status'],
            columnTypes: ['INTEGER', 'INTEGER', 'TEXT'],
          })
        }

        if (sql.includes('passcode')) {
          return Promise.resolve({
            rows: filtered.length > 0
              ? filtered.map((r) => ({ ...r, passcode: r.passcode ?? '000000' }))
              : [],
            rowsAffected: 0,
            lastInsertRowid: null,
            columns: ['id', 'passcode', 'status'],
            columnTypes: ['TEXT', 'TEXT', 'TEXT'],
          })
        }

        return Promise.resolve({
          rows: filtered,
          rowsAffected: 0,
          lastInsertRowid: null,
          columns: [],
          columnTypes: [],
        })
      }

      if (sql.includes('JOIN faces') || sql.includes('JOIN face_embeddings')) {
        return Promise.resolve({
          rows: [
            {
              id: 'photo_001',
              r2_key: 'events/evt_test/photo_001.jpg',
              thumbnail_200_key: 'events/evt_test/thumbs/200/photo_001.jpg',
              thumbnail_800_key: 'events/evt_test/thumbs/800/photo_001.jpg',
              width: 4032,
              height: 3024,
            },
            {
              id: 'photo_002',
              r2_key: 'events/evt_test/photo_002.jpg',
              thumbnail_200_key: null,
              thumbnail_800_key: 'events/evt_test/thumbs/800/photo_002.jpg',
              width: 3024,
              height: 4032,
            },
          ],
          rowsAffected: 0,
          lastInsertRowid: null,
          columns: [],
          columnTypes: [],
        })
      }

      if (sql.includes('COUNT(*)')) {
        return Promise.resolve({
          rows: [{ 'COUNT(*)': rows.length }],
          rowsAffected: 0,
          lastInsertRowid: null,
          columns: ['COUNT(*)'],
          columnTypes: ['INTEGER'],
        })
      }

      return Promise.resolve({
        rows,
        rowsAffected: 0,
        lastInsertRowid: null,
        columns: [],
        columnTypes: [],
      })
    }

    if (sql.toUpperCase().includes('UPDATE')) {
      return Promise.resolve({
        rows: [],
        rowsAffected: 1,
        lastInsertRowid: null,
        columns: [],
        columnTypes: [],
      })
    }

    if (sql.toUpperCase().includes('DELETE')) {
      return Promise.resolve({
        rows: [],
        rowsAffected: 1,
        lastInsertRowid: null,
        columns: [],
        columnTypes: [],
      })
    }

    return Promise.resolve({
      rows: [],
      rowsAffected: 0,
      lastInsertRowid: null,
      columns: [],
      columnTypes: [],
    })
  }

  function seed(table: string, rows: Row[]) {
    if (tables[table]) {
      tables[table].push(...rows)
    }
  }

  function reset() {
    for (const key of Object.keys(tables)) {
      tables[key] = []
    }
    idCounter = 0
  }

  function getTable(table: string) {
    return tables[table] ?? []
  }

  return { execute, seed, reset, getTable }
}

export type MockDb = ReturnType<typeof createMockDb>
