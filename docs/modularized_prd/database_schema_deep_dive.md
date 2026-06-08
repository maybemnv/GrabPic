# GrabPic - Database Schema Deep Dive

**Version:** 1.0
**Date:** February 9, 2026
**Owner:** Product Engineering
**Status:** Planning Phase

---

## Events Table
```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,                    -- UUID v4
  name TEXT NOT NULL,                     -- "Sarah's Wedding"
  passcode TEXT NOT NULL,                 -- 6-digit numeric
  created_at INTEGER NOT NULL,            -- Unix timestamp
  expires_at INTEGER NOT NULL,            -- created_at + 30 days
  status TEXT DEFAULT 'processing',       -- processing|ready|expired|failed
  photo_count INTEGER DEFAULT 0,
  face_count INTEGER DEFAULT 0,
  organizer_email TEXT,
  organizer_name TEXT,
  max_photos INTEGER DEFAULT 1000,
  tier TEXT DEFAULT 'free'               -- free|pro
);

CREATE INDEX idx_events_passcode ON events(passcode);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_expires_at ON events(expires_at);
```

## Photos Table
```sql
CREATE TABLE photos (
  id TEXT PRIMARY KEY,                    -- UUID v4
  event_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,                   -- Original: events/{event_id}/{photo_id}.jpg
  thumbnail_200_key TEXT,                 -- Thumb: events/{event_id}/thumbs/200/{photo_id}.jpg
  thumbnail_800_key TEXT,
  uploaded_at INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  file_size INTEGER,                      -- Bytes
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX idx_photos_event ON photos(event_id);
```

## Faces Table
```sql
CREATE TABLE faces (
  id TEXT PRIMARY KEY,                    -- UUID v4
  photo_id TEXT NOT NULL,
  bbox TEXT NOT NULL,                     -- JSON: {"x": 120, "y": 80, "width": 100, "height": 120}
  confidence REAL NOT NULL,               -- 0.0 to 1.0
  cluster_id TEXT,                        -- Links similar faces (same person)
  landmarks TEXT,                         -- JSON: eye, nose, mouth coords (optional)
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
);

CREATE INDEX idx_faces_photo ON faces(photo_id);
CREATE INDEX idx_faces_cluster ON faces(cluster_id);
```

## Face Embeddings Table
```sql
CREATE TABLE face_embeddings (
  id TEXT PRIMARY KEY,
  face_id TEXT NOT NULL UNIQUE,
  embedding BLOB NOT NULL,                -- 512 × 4 bytes = 2048 bytes
  created_at INTEGER NOT NULL,
  FOREIGN KEY (face_id) REFERENCES faces(id) ON DELETE CASCADE
);

-- Vector search index (sqlite-vss)
CREATE VIRTUAL TABLE vec_embeddings USING vss0(
  embedding(512)  -- 512-dimensional float32 vectors
);

-- Insert trigger to keep vss table in sync
CREATE TRIGGER face_embeddings_insert
AFTER INSERT ON face_embeddings
BEGIN
  INSERT INTO vec_embeddings(rowid, embedding)
  VALUES (NEW.rowid, NEW.embedding);
END;
```

## Match Sessions Table (Optional - for analytics)
```sql
CREATE TABLE match_sessions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  user_ip TEXT,
  matched_count INTEGER,
  similarity_threshold REAL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);
```