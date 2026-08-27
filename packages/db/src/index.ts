import { createClient } from '@libsql/client'

export function createDbClient(url: string, authToken: string) {
  return createClient({
    url,
    authToken,
  })
}

export const schema = {
  events: [
    `
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      passcode TEXT NOT NULL,
      invite_token TEXT,
      organizer_token_hash TEXT,
      processing_batch_id TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      status TEXT DEFAULT 'processing',
      photo_count INTEGER DEFAULT 0,
      face_count INTEGER DEFAULT 0,
      organizer_email TEXT,
      organizer_name TEXT,
      max_photos INTEGER DEFAULT 1000,
      tier TEXT DEFAULT 'free'
    )
  `,
    'CREATE INDEX IF NOT EXISTS idx_events_passcode ON events(passcode)',
    'CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)',
    'CREATE INDEX IF NOT EXISTS idx_events_expires_at ON events(expires_at)',
  ],
  photos: [
    `
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      r2_key TEXT NOT NULL,
      thumbnail_200_key TEXT,
      thumbnail_800_key TEXT,
      uploaded_at INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      file_size INTEGER,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `,
    'CREATE INDEX IF NOT EXISTS idx_photos_event ON photos(event_id)',
  ],
  faces: [
    `
    CREATE TABLE IF NOT EXISTS faces (
      id TEXT PRIMARY KEY,
      photo_id TEXT NOT NULL,
      bbox TEXT NOT NULL,
      confidence REAL NOT NULL,
      cluster_id TEXT,
      landmarks TEXT,
      FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
    )
  `,
    'CREATE INDEX IF NOT EXISTS idx_faces_photo ON faces(photo_id)',
    'CREATE INDEX IF NOT EXISTS idx_faces_cluster ON faces(cluster_id)',
  ],
  faceEmbeddings: [
    `
    CREATE TABLE IF NOT EXISTS face_embeddings (
      id TEXT PRIMARY KEY,
      face_id TEXT NOT NULL UNIQUE,
      embedding BLOB NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (face_id) REFERENCES faces(id) ON DELETE CASCADE
    )
  `,
  ],
  matchSessions: [
    `
    CREATE TABLE IF NOT EXISTS match_sessions (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      user_ip TEXT,
      matched_count INTEGER,
      similarity_threshold REAL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `,
  ],
}

export function getSchemaStatements(): string[] {
  return Object.values(schema).flat()
}

export async function migrate(url: string, authToken: string) {
  const db = createDbClient(url, authToken)
  for (const sql of getSchemaStatements()) {
    await db.execute(sql)
  }

  try {
    await db.execute('ALTER TABLE events ADD COLUMN invite_token TEXT')
  } catch (error) {
    if (!String(error).toLowerCase().includes('duplicate column')) throw error
  }
  for (const column of ['organizer_token_hash', 'processing_batch_id']) {
    try {
      await db.execute(`ALTER TABLE events ADD COLUMN ${column} TEXT`)
    } catch (error) {
      if (!String(error).toLowerCase().includes('duplicate column')) throw error
    }
  }

  const duplicatePasscodes = await db.execute(
    'SELECT passcode FROM events GROUP BY passcode HAVING COUNT(*) > 1',
  )
  for (const row of duplicatePasscodes.rows) {
    const passcode = String((row as Record<string, unknown>).passcode)
    const duplicateEvents = await db.execute({
      sql: 'SELECT id FROM events WHERE passcode = ? ORDER BY created_at ASC, id ASC',
      args: [passcode],
    })
    for (const duplicate of duplicateEvents.rows.slice(1)) {
      let replacement = ''
      let foundReplacement = false
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const bytes = new Uint32Array(1)
        crypto.getRandomValues(bytes)
        replacement = String(100000 + (bytes[0] % 900000))
        const existing = await db.execute({
          sql: 'SELECT 1 FROM events WHERE passcode = ?',
          args: [replacement],
        })
        if (existing.rows.length === 0) {
          foundReplacement = true
          break
        }
      }
      if (!foundReplacement) throw new Error('Unable to repair duplicate event passcode')
      await db.execute({
        sql: 'UPDATE events SET passcode = ? WHERE id = ?',
        args: [replacement, String((duplicate as Record<string, unknown>).id)],
      })
    }
  }
  await db.execute(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_events_passcode_unique ON events(passcode)',
  )
  await db.execute(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_events_invite_token ON events(invite_token)',
  )

  const eventsWithoutInvites = await db.execute(
    "SELECT id FROM events WHERE invite_token IS NULL OR invite_token = ''",
  )
  for (const row of eventsWithoutInvites.rows) {
    await db.execute({
      sql: 'UPDATE events SET invite_token = ? WHERE id = ?',
      args: [crypto.randomUUID().replaceAll('-', ''), String((row as Record<string, unknown>).id)],
    })
  }
}
