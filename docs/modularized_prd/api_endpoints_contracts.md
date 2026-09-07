# GrabPic - API Endpoints & Contracts

**Version:** 1.0
**Date:** February 9, 2026
**Owner:** Product Engineering
**Status:** Implemented contract (controlled/private pilot)

---

## Base URL
- Production: `https://api.GrabPic.app`
- Development: `http://localhost:8787`

## Authentication
- Organizer: one-time high-entropy bearer token returned by event creation; only its SHA-256 hash is stored. Send `Authorization: Bearer <organizerToken>` for event detail, status, upload, confirmation, delete, and QR routes.
- Attendee: event passcode or opaque invite token (no account required)

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
  "organizerToken": "<one-time bearer token; save it securely>",
  "uploadUrl": "https://api.GrabPic.app/events/evt_1a2b3c4d/upload",
  "shareUrl": "https://GrabPic.app/e/0123456789abcdef0123456789abcdef",
  "qrCode": "https://api.GrabPic.app/qr/evt_1a2b3c4d",
  "expiresAt": 1741824000
}
```

---

### **POST /events/:eventId/upload**
Get signed URLs for photo upload

**Headers:** `Authorization: Bearer <organizerToken>`

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

**Headers:** `Authorization: Bearer <organizerToken>`

Only the first successful confirmation claims the event processing batch in Phase 1. Later confirmations are rejected.

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

**Headers:** `Authorization: Bearer <organizerToken>`

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
  "selfieData": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."  // Base64
}
```

**Response:**
```json
{
  "matches": [
    {
      "photoId": "photo_abc123",
      "similarity": 0.87,
       "url": "<short-lived-presigned-original-url>",
       "thumbnailUrl": "<short-lived-presigned-800px-url>",
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
       "url": "<short-lived-presigned-original-url>",
       "thumbnailUrl": "<short-lived-presigned-800px-url>",
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

The Worker generates the selfie embedding through Modal, invokes the Convex
matching action with the external event ID, and signs the returned R2 keys.
The Convex action uses the server-owned threshold and a mandatory
`eventId` equality filter on the 512-dimensional vector index. It requests at
most 256 candidates, applies the inclusive threshold, keeps the best face per
photo, and returns no more than 100 photos. Convex references and embeddings
are never exposed in the API response.

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
Authorization: Bearer <organizerToken>
```

**Response:**
```json
{
  "deleted": true,
  "photosDeleted": 250,
  "storageFreed": 1250000000  // bytes
}
```
