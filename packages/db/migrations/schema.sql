CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  passcode TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT DEFAULT 'processing',
  photo_count INTEGER DEFAULT 0,
  face_count INTEGER DEFAULT 0,
  organizer_email TEXT,
  organizer_name TEXT,
  max_photos INTEGER DEFAULT 1000,
  tier TEXT DEFAULT 'free'
);
CREATE INDEX IF NOT EXISTS idx_events_passcode ON events(passcode);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_expires_at ON events(expires_at);

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
);
CREATE INDEX IF NOT EXISTS idx_photos_event ON photos(event_id);

CREATE TABLE IF NOT EXISTS faces (
  id TEXT PRIMARY KEY,
  photo_id TEXT NOT NULL,
  bbox TEXT NOT NULL,
  confidence REAL NOT NULL,
  cluster_id TEXT,
  landmarks TEXT,
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_faces_photo ON faces(photo_id);
CREATE INDEX IF NOT EXISTS idx_faces_cluster ON faces(cluster_id);

CREATE TABLE IF NOT EXISTS face_embeddings (
  id TEXT PRIMARY KEY,
  face_id TEXT NOT NULL UNIQUE,
  embedding BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (face_id) REFERENCES faces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_sessions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  user_ip TEXT,
  matched_count INTEGER,
  similarity_threshold REAL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);
