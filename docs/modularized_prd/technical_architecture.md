# FaceFind - Technical Architecture

**Version:** 1.0
**Date:** February 9, 2026
**Owner:** Product Engineering
**Status:** Planning Phase

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  Next.js Frontend (Vercel)                                       │
│  ├─ Organizer Dashboard (upload, manage events)                 │
│  ├─ Attendee Portal (selfie, gallery)                           │
│  └─ Camera Integration (WebRTC, MediaDevices API)               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTPS/REST
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       API LAYER (Edge)                           │
├─────────────────────────────────────────────────────────────────┤
│  Cloudflare Workers / Hono.js                                    │
│  ├─ POST /events (create event)                                 │
│  ├─ POST /events/:id/upload (signed URLs)                       │
│  ├─ POST /events/:id/match (selfie matching)                    │
│  ├─ GET /events/:id/photos (retrieve matches)                   │
│  └─ Authentication & Rate Limiting                              │
└────────────┬───────────────────────┬────────────────────────────┘
             │                       │
             ▼                       ▼
┌─────────────────────┐   ┌──────────────────────────────────────┐
│   STORAGE LAYER     │   │      PROCESSING LAYER                │
├─────────────────────┤   ├──────────────────────────────────────┤
│ Cloudflare R2       │   │ Modal.com (GPU Serverless)           │
│ - Original Photos   │   │ ├─ Face Detection (MTCNN/RetinaFace) │
│ - Thumbnails        │   │ ├─ Embedding Gen (FaceNet/ArcFace)   │
│ - CDN Delivery      │   │ └─ Clustering (DBSCAN)               │
│                     │   │                                       │
│ Cost: $0.015/GB     │   │ Cost: $0.10/min GPU                  │
└─────────────────────┘   └───────────┬──────────────────────────┘
                                      │
                                      ▼
                          ┌────────────────────────────┐
                          │    DATABASE LAYER          │
                          ├────────────────────────────┤
                          │ Turso (SQLite + Vector)    │
                          │                            │
                          │ Tables:                    │
                          │ ├─ events                  │
                          │ ├─ photos                  │
                          │ ├─ faces                   │
                          │ └─ face_embeddings (vector)│
                          │                            │
                          │ Vector Extension:          │
                          │ - sqlite-vss               │
                          │ - Cosine similarity search │
                          └────────────────────────────┘
```

## Data Flow

```
UPLOAD FLOW:
User uploads photos → R2 signed URL → Photos stored
                                    ↓
                          Trigger Modal job (webhook)
                                    ↓
                     ┌─ Detect faces (MTCNN)
                     ├─ Generate embeddings (FaceNet)
                     ├─ Cluster faces (DBSCAN)
                     └─ Store in Turso with photo_id mapping
                                    ↓
                           Event status: READY

MATCH FLOW:
User takes selfie → Extract embedding (client-side ONNX or edge)
                                    ↓
                    Send to /events/:id/match endpoint
                                    ↓
                    Vector similarity search (Turso)
                    SELECT photo_id, similarity
                    FROM face_embeddings
                    WHERE event_id = ?
                    ORDER BY vec_distance(embedding, ?)
                    LIMIT 50
                                    ↓
                    Filter by threshold (>0.6 similarity)
                                    ↓
                    Return signed R2 URLs for matched photos
                                    ↓
                    Client displays gallery
```