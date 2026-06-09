# API Usage Examples

Base URL: `https://api.grabpic.app` (local dev: `http://localhost:8787`)

## Create Event

```bash
curl -X POST https://api.grabpic.app/events \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Company Holiday Party",
    "organizerEmail": "alice@example.com",
    "organizerName": "Alice"
  }'
```

Response:
```json
{
  "eventId": "evt_a1b2c3d4",
  "passcode": "837291",
  "uploadUrl": "/events/evt_a1b2c3d4/upload",
  "shareUrl": "https://grabpic.app/e/837291",
  "qrCode": "https://api.grabpic.app/qr/evt_a1b2c3d4",
  "expiresAt": 1778457600
}
```

## Get Event

```bash
curl https://api.grabpic.app/events/evt_a1b2c3d4
```

## Check Processing Status

```bash
curl https://api.grabpic.app/events/evt_a1b2c3d4/status
```

Response:
```json
{
  "status": "ready",
  "photoCount": 150,
  "faceCount": 312,
  "progress": 100,
  "error": null
}
```

## Generate Upload URLs

```bash
curl -X POST https://api.grabpic.app/events/evt_a1b2c3d4/upload \
  -H "Content-Type: application/json" \
  -d '{
    "photos": [
      {"filename": "group_shot.jpg", "size": 5242880, "type": "image/jpeg"},
      {"filename": "candids.jpg", "size": 3145728, "type": "image/jpeg"}
    ]
  }'
```

Response:
```json
{
  "uploadUrls": [
    {"photoId": "photo_uuid1", "uploadUrl": "https://r2.signed.url/...", "filename": "group_shot.jpg"},
    {"photoId": "photo_uuid2", "uploadUrl": "https://r2.signed.url/...", "filename": "candids.jpg"}
  ]
}
```

## Upload Photo to R2

Use the signed URL from the previous step (PUT request with binary data):

```bash
curl -X PUT "<signed-url>" \
  -H "Content-Type: image/jpeg" \
  --data-binary @group_shot.jpg
```

## Confirm Upload & Trigger Processing

```bash
curl -X POST https://api.grabpic.app/events/evt_a1b2c3d4/upload/confirm \
  -H "Content-Type: application/json" \
  -d '{"photoIds": ["photo_uuid1", "photo_uuid2"]}'
```

Response:
```json
{
  "status": "processing",
  "jobId": "job_evt_a1b2c3d4",
  "estimatedTime": 120
}
```

## Match Selfie

```bash
curl -X POST https://api.grabpic.app/events/evt_a1b2c3d4/match \
  -H "Content-Type: application/json" \
  -d '{
    "passcode": "837291",
    "selfieData": "data:image/jpeg;base64,/9j/4AAQ...",
    "threshold": 0.6
  }'
```

Response:
```json
{
  "matches": [
    {"photoId": "photo_uuid1", "similarity": 0.87, "url": "/api/photos/photo_uuid1", "thumbnailUrl": "/api/thumbs/photo_uuid1", "width": 1920, "height": 1080, "faces": [{"bbox": {"x": 100, "y": 200, "width": 80, "height": 80}, "isMatch": true}]}
  ],
  "totalMatches": 5,
  "processingTime": 234
}
```

## Delete Event

```bash
curl -X DELETE https://api.grabpic.app/events/evt_a1b2c3d4
```

Response:
```json
{
  "deleted": true,
  "photosDeleted": 150,
  "storageFreed": 786432000
}
```

## Health Checks

```bash
curl https://api.grabpic.app/health
# {"status":"ok"}

curl https://api.grabpic.app/health/processing
# {"status":"ok","database":"connected"}
```

## QR Code

```bash
# Returns SVG image
curl https://api.grabpic.app/qr/evt_a1b2c3d4 -o qr.svg
```
