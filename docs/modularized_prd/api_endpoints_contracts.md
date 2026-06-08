# GrabPic - API Endpoints & Contracts

**Version:** 1.0
**Date:** February 9, 2026
**Owner:** Product Engineering
**Status:** Planning Phase

---

## Base URL
- Production: `https://api.GrabPic.app`
- Development: `http://localhost:8787`

## Authentication
- Organizer: JWT token (email-based login)
- Attendee: Event passcode (no account required)

---

### **POST /events**
Create new event

**Request:**
```json
{
  "name": "Tech Conference 2026",
  "organizerEmail": "sarah@example.com",
  "organizerName": "Sarah Johnson",
  "expiryDays": 30
}
```

**Response:**
```json
{
  "eventId": "evt_1a2b3c4d",
  "passcode": "123456",
  "uploadUrl": "https://api.GrabPic.app/events/evt_1a2b3c4d/upload",
  "shareUrl": "https://GrabPic.app/e/123456",
  "qrCode": "https://api.GrabPic.app/qr/evt_1a2b3c4d",
  "expiresAt": 1741824000
}
```

---

### **POST /events/:eventId/upload**
Get signed URLs for photo upload

**Request:**
```json
{
  "photos": [
    {"filename": "IMG_001.jpg", "size": 4857344, "type": "image/jpeg"},
    {"filename": "IMG_002.jpg", "size": 5123456, "type": "image/jpeg"}
  ]
}
```

**Response:**
```json
{
  "uploadUrls": [
    {
      "photoId": "photo_abc123",
      "uploadUrl": "https://r2.GrabPic.app/signed-url-1",
      "filename": "IMG_001.jpg"
    },
    {
      "photoId": "photo_def456",
      "uploadUrl": "https://r2.GrabPic.app/signed-url-2",
      "filename": "IMG_002.jpg"
    }
  ]
}
```

**Client Flow:**
```typescript
// 1. Request signed URLs
const { uploadUrls } = await fetch('/events/evt_123/upload', {
  method: 'POST',
  body: JSON.stringify({ photos: fileMetadata })
})

// 2. Upload directly to R2
await Promise.all(
  uploadUrls.map(({ uploadUrl, photoId }, i) =>
    fetch(uploadUrl, {
      method: 'PUT',
      body: files[i],
      headers: { 'Content-Type': files[i].type }
    })
  )
)

// 3. Confirm upload
await fetch('/events/evt_123/upload/confirm', {
  method: 'POST',
  body: JSON.stringify({ photoIds: uploadUrls.map(u => u.photoId) })
})
```

---

### **POST /events/:eventId/upload/confirm**
Trigger processing after upload complete

**Request:**
```json
{
  "photoIds": ["photo_abc123", "photo_def456"]
}
```

**Response:**
```json
{
  "status": "processing",
  "jobId": "job_xyz789",
  "estimatedTime": 120  // seconds
}
```

**Backend Action:**
- Trigger Modal.com job webhook
- Update event status to "processing"

---

### **GET /events/:eventId/status**
Check processing status

**Response:**
```json
{
  "status": "ready",  // processing|ready|failed
  "photoCount": 250,
  "faceCount": 487,
  "progress": 100,  // 0-100
  "error": null
}
```

---

### **POST /events/:eventId/match**
Match selfie to event photos

**Request:**
```json
{
  "passcode": "123456",
  "selfieData": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",  // Base64
  "threshold": 0.6  // Optional, default 0.6
}
```

**Response:**
```json
{
  "matches": [
    {
      "photoId": "photo_abc123",
      "similarity": 0.87,
      "url": "https://cdn.GrabPic.app/evt_123/photo_abc123_800.jpg",
      "thumbnailUrl": "https://cdn.GrabPic.app/evt_123/photo_abc123_200.jpg",
      "width": 4032,
      "height": 3024,
      "faces": [
        {
          "bbox": {"x": 1200, "y": 800, "width": 400, "height": 480},
          "isMatch": true
        }
      ]
    },
    {
      "photoId": "photo_def456",
      "similarity": 0.73,
      "url": "https://cdn.GrabPic.app/evt_123/photo_def456_800.jpg",
      "thumbnailUrl": "https://cdn.GrabPic.app/evt_123/photo_def456_200.jpg",
      "width": 3024,
      "height": 4032,
      "faces": [
        {
          "bbox": {"x": 500, "y": 1200, "width": 350, "height": 420},
          "isMatch": true
        }
      ]
    }
  ],
  "totalMatches": 42,
  "processingTime": 234  // milliseconds
}
```

**Backend Logic:**
```typescript
// /api/routes/match.ts
export async function matchSelfie(eventId: string, selfieBase64: string, threshold = 0.6) {
  // 1. Generate embedding from selfie
  const queryEmbedding = await generateEmbedding(selfieBase64)

  // 2. Vector similarity search
  const results = await db.execute(`
    SELECT
      f.id as face_id,
      f.photo_id,
      f.bbox,
      vec_distance_cosine(fe.embedding, ?) as distance,
      (1 - vec_distance_cosine(fe.embedding, ?)) as similarity
    FROM faces f
    JOIN face_embeddings fe ON f.id = fe.face_id
    JOIN photos p ON f.photo_id = p.id
    WHERE p.event_id = ?
      AND (1 - vec_distance_cosine(fe.embedding, ?)) > ?
    ORDER BY similarity DESC
    LIMIT 100
  `, [queryEmbedding, queryEmbedding, eventId, queryEmbedding, threshold])

  // 3. Group by photo_id, get photo details
  const photoIds = [...new Set(results.rows.map(r => r.photo_id))]
  const photos = await getPhotoDetails(photoIds)

  // 4. Return matched photos with CDN URLs
  return photos.map(photo => ({
    photoId: photo.id,
    similarity: results.rows.find(r => r.photo_id === photo.id)?.similarity,
    url: getR2SignedUrl(photo.r2_key),
    thumbnailUrl: getR2SignedUrl(photo.thumbnail_800_key),
    // ...
  }))
}
```

---

### **GET /events/:eventId/photos/:photoId**
Get single photo with signed URL

**Response:**
```json
{
  "photoId": "photo_abc123",
  "url": "https://cdn.GrabPic.app/signed-url-expires-in-1h",
  "thumbnailUrl": "https://cdn.GrabPic.app/thumb-signed-url",
  "width": 4032,
  "height": 3024,
  "faces": [
    {
      "bbox": {"x": 1200, "y": 800, "width": 400, "height": 480}
    }
  ]
}
```

---

### **DELETE /events/:eventId**
Delete event and all photos (organizer only)

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "deleted": true,
  "photosDeleted": 250,
  "storageFreed": 1250000000  // bytes
}
```