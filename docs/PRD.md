# GrabPic - Product Requirements Document (PRD)

**Version:** 1.0

**Date:** February 9, 2026

**Owner:** Product Engineering

**Status:** Planning Phase

---

## Executive Summary

### Product Vision

GrabPic eliminates the post-event photo distribution nightmare by using facial recognition to instantly deliver personalized photo collections to event attendees. Organizers upload once; attendees get their photos in seconds with a single selfie.

### The Problem (Market Pain)

- **Organizers:** Spend 5-10 hours manually sorting/sharing photos via Google Drive/WhatsApp
- **Attendees:** Scroll through 1000+ photos to find themselves, often missing great shots
- **Current Solutions:** Manual tagging (Facebook), shared folders (chaos), or professional photographers ($$$)

### The Solution

Automated facial recognition pipeline that:

1. Processes event photos in bulk (background)
2. Creates face embeddings and clusters
3. Matches attendees via selfie → instant personalized gallery
4. 90% time savings for organizers, 10x better attendee experience

### Senior PM Rating: **8.5/10**

**Strengths:**

-Clear pain point with measurable impact

-Simple UX (selfie → photos)

-Network effects (viral within event communities)

-B2B2C opportunity (event companies, wedding photographers)

-Low marginal cost at scale

**Risks:**

-Privacy regulations (GDPR, BIPA) - mitigable

-Model accuracy on diverse faces - solvable with good models

-Competition from Google Photos/Apple Photos (but they don't solve event distribution)

-Cold start (need organizers to upload)

**Market Opportunity:**

-TAM: $2B+ (event photography, corporate events, weddings)

-Weddings alone: 2.5M/year in US × $3-10/event

-Corporate events: 500K+/year globally

---

## Goals & Success Metrics

### North Star Metric

**Time from selfie to viewing photos: <5 seconds**

### Primary Metrics (3-Month Horizon)

| Metric | Target | Measurement |

|--------|--------|-------------|

| Events Processed | 100 events | Backend analytics |

| Photos Processed | 50K+ photos | Storage metrics |

| User Accuracy Rate | >85% match quality | User feedback, manual audit |

| Avg. Processing Time | <2 min per 100 photos | Background job metrics |

| User Satisfaction | NPS >40 | Post-session survey |

| Cost per Event | <$3 | AWS/Cloud billing |

### Secondary Metrics

-Viral coefficient (invites/user)

-Photo download rate

-Return organizer rate

-API latency (p95 <500ms)

### Resume-Worthy Outcomes

-"Built scalable facial recognition pipeline processing 50K+ images/month"

-"Architected vector search system achieving <200ms query latency"

-"Designed privacy-first ML system compliant with GDPR/BIPA"

-"Deployed serverless architecture reducing compute costs by 80%"

-"End-to-end ownership: 0→1 product with real users"

---

## User Personas & Journey

### Persona 1: Event Organizer (Sarah, 28, Corporate Event Planner)

**Jobs to be Done:**

-Efficiently share 500+ photos with 100+ attendees

-Maintain professional image

-Save time on post-event admin

**Current Workflow (Pain):**

1. Takes 300-500 photos at event
2. Spends 3-4 hours uploading to Google Drive
3. Shares link in WhatsApp group
4. Gets bombarded with "where's my photo?" messages
5. Manually sends individual photos via DM

**GrabPic Workflow (Delight):**

1. Bulk upload photos (10 mins)
2. Generate event code
3. Share code with attendees
4. Done. System handles rest.

**User Journey Map:**

```

Awareness → Signup → Upload Photos → Processing → Share Code → Monitor Analytics → Export/Delete

   ↓          ↓           ↓              ↓            ↓              ↓                ↓

Landing    Email      Drag&Drop     Progress     QR Code       Dashboard        Data Control

  Page    Verify      Interface      Bar       Generation     (downloads)       (privacy)

```

### Persona 2: Event Attendee (Mike, 24, College Student)

**Jobs to be Done:**

-Find photos of himself quickly

-Download high-quality versions

-Share on social media

**Current Workflow (Pain):**

1. Clicks Google Drive link
2. Scrolls through 400 photos
3. Downloads ~30, misses ~10 good ones
4. Frustration with file organization

**GrabPic Workflow (Delight):**

1. Opens event link
2. Takes selfie (3 seconds)
3. Gets personalized gallery instantly
4. Downloads favorites

**User Journey Map:**

```

Receives Link → Opens App → Takes Selfie → Views Gallery → Downloads → Shares

      ↓            ↓           ↓              ↓             ↓           ↓

  WhatsApp/     Camera      Face         Curated        Bulk       Instagram

   Email        Prompt     Matching      Results       Download    Direct Post

```

---

## Features & Functionality

### MVP (Phase 1) - Weeks 1-4

#### Organizer Features

| Feature | Description | Priority |

|---------|-------------|----------|

|**Bulk Photo Upload**| Drag-and-drop or file picker, max 1000 photos/event | P0 |

|**Event Creation**| Simple form: event name, date, passcode | P0 |

|**Processing Dashboard**| Real-time progress bar for face detection | P0 |

|**Share Event Code**| Unique 6-digit code + QR code | P0 |

|**Event Expiry**| Auto-delete after 30 days (privacy) | P0 |

#### Attendee Features

| Feature | Description | Priority |

|---------|-------------|----------|

|**Event Access**| Enter code → access event | P0 |

|**Selfie Capture**| Front camera with live preview | P0 |

|**Face Matching**| Display matched photos in grid | P0 |

|**Photo Download**| Individual or bulk download | P0 |

|**Gallery View**| Lightbox with zoom, swipe navigation | P1 |

#### System Features

| Feature | Description | Priority |

|---------|-------------|----------|

|**Face Detection**| Detect all faces in uploaded photos | P0 |

|**Embedding Generation**| Create 512-dim vectors per face | P0 |

|**Face Clustering**| Group similar faces (same person) | P0 |

|**Vector Search**| Cosine similarity for matching | P0 |

|**Image Optimization**| Thumbnail generation (200px, 800px) | P1 |

### Phase 2 (Weeks 5-8) - Enhanced Features

| Feature | Description | Impact |

|---------|-------------|--------|

|**Quality Scoring**| Rank photos by smile, sharpness, composition | High |

|**Multi-Face Search**| "Find photos with me AND friends" | High |

|**Privacy Blur**| Blur other faces in downloaded photos | Medium |

|**Email Delivery**| Email personalized gallery link | Medium |

|**Analytics Dashboard**| Organizer sees download stats | Low |

|**Group Detection**| Identify common groups in photos | Low |

### Phase 3 (Weeks 9-12) - Monetization & Scale

| Feature | Description | Impact |

|---------|-------------|--------|

|**Paid Tiers**| Free: 100 photos, Paid: Unlimited | Critical |

|**Watermark Removal**| Paid feature | High |

|**API for Photographers**| B2B integration | High |

|**Album Auto-Generation**| AI-curated best-of albums | Medium |

|**Video Support**| Face detection in videos | Low |

---

## Technical Architecture

### System Architecture Diagram

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

### Data Flow

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

---

## Tech Stack Decisions (Optimized for Cost + Speed)

### Frontend

**Choice: Next.js 14 (App Router) + TypeScript**

**Why:**

-Server Components for SEO

-Built-in image optimization

-Vercel deployment (free tier)

-Great DX with hot reload

**Alternatives Considered:**

-❌ React + Vite: No SSR, worse SEO

-❌ SvelteKit: Smaller ecosystem

-✅ Next.js: Best balance

**Key Libraries:**

```json

{

  "next":"14.x",

  "react":"18.x",

  "tailwindcss":"3.x",

  "shadcn/ui":"latest",

  "react-dropzone":"14.x",

  "onnxruntime-web":"1.17.x"  // Client-side embedding

}

```

### Backend API

**Choice: Hono.js on Cloudflare Workers**

**Why:**

-Edge deployment (low latency globally)

-Generous free tier (100K req/day)

-TypeScript-first

-Tiny bundle size (<50KB)

-Built-in CORS, validation

**Alternatives Considered:**

-❌ Express.js: Need dedicated server (cost)

-❌ FastAPI: Python runtime overhead

-✅ Hono + CF Workers: Fastest, cheapest

**Architecture:**

```typescript

// /src/api/index.ts

import{Hono}from'hono'

import{cors}from'hono/cors'

import{events}from'./routes/events'

import{match}from'./routes/match'


constapp=newHono()


app.use('/*',cors())

app.route('/events',events)

app.route('/match',match)


exportdefaultapp

```

### Database

**Choice: Turso (LibSQL with Vector Extension)**

**Why:**

-SQLite-based (fast reads)

-Edge replicas (low latency)

-Vector search built-in (sqlite-vss)

-Free tier: 8GB storage, 1B row reads/month

-TypeScript SDK

**Schema:**

```sql

-- events table

CREATETABLE events (

  id TEXTPRIMARYKEY,

  nameTEXTNOTNULL,

  passcode TEXTNOTNULL,

  created_at INTEGERNOTNULL,

  expires_at INTEGERNOTNULL,

  statusTEXT DEFAULT 'processing', -- processing|ready|expired

  photo_count INTEGER DEFAULT 0,

  organizer_email TEXT

);


-- photos table

CREATETABLE photos (

  id TEXTPRIMARYKEY,

  event_id TEXTNOTNULL,

  r2_key TEXTNOTNULL,

  thumbnail_key TEXT,

  uploaded_at INTEGERNOTNULL,

  width INTEGER,

  height INTEGER,

  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE

);


-- faces table (detected faces in photos)

CREATETABLE faces (

  id TEXTPRIMARYKEY,

  photo_id TEXTNOTNULL,

  bbox TEXTNOTNULL, -- JSON: {x, y, width, height}

  confidence REALNOTNULL,

  cluster_id TEXT, -- Group similar faces

  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE

);


-- face_embeddings table (vector search)

CREATETABLE face_embeddings (

  id TEXTPRIMARYKEY,

  face_id TEXTNOTNULL UNIQUE,

  embedding BLOB NOTNULL, -- 512-dim float32 vector

  FOREIGN KEY (face_id) REFERENCES faces(id) ON DELETE CASCADE

);


-- Create vector index

CREATE VIRTUAL TABLE vec_embeddings USING vss0(

  embedding(512)

);

```

**Alternatives Considered:**

-❌ Pinecone: $70/month for production

-❌ PostgreSQL + pgvector: Need managed instance ($25/mo+)

-✅ Turso: Free tier sufficient, scales linearly

### Object Storage

**Choice: Cloudflare R2**

**Why:**

-$0.015/GB storage (10x cheaper than S3)

-Zero egress fees (S3 charges $0.09/GB)

-S3-compatible API

-Tight integration with Workers

**Cost Projection:**

-100 events/month × 500 photos × 5MB = 250GB

-Storage: 250GB × $0.015 = $3.75/month

-Egress (S3 equivalent): 250GB × $0.09 = $22.50/month

- **Savings with R2: $18.75/month**

**Alternatives Considered:**

-❌ AWS S3: Expensive egress

-❌ Backblaze B2: Slower global delivery

-✅ R2: Best price + performance

### ML Processing

**Choice: Modal.com (Serverless GPU)**

**Why:**

-Pay-per-second GPU billing

-Auto-scales to zero

-Python-based (easy ML libs)

-Fast cold starts (<10s)

-Free tier: $30 credits/month

**Face Detection Pipeline:**

```python

# /ml/processor.py

import modal

from facenet_pytorch importMTCNN, InceptionResnetV1

import torch


stub = modal.Stub("GrabPic-processor")


@stub.function(

    gpu="T4",

    image=modal.Image.debian_slim().pip_install(

        "facenet-pytorch","torch","pillow"

    )

)

defprocess_event_photos(event_id:str,photo_urls: list[str]):

    device = torch.device('cuda')

    mtcnn = MTCNN(keep_all=True,device=device)

    resnet = InceptionResnetV1(pretrained='vggface2').eval().to(device)

  

    results =[]

    for url in photo_urls:

        # Download image

        img = download_image(url)

      

        # Detect faces

        boxes, probs = mtcnn.detect(img)

      

        if boxes isnotNone:

            # Extract face tensors

            faces = mtcnn(img)

          

            # Generate embeddings

            embeddings = resnet(faces).detach().cpu().numpy()

          

            results.append({

                'photo_url': url,

                'faces':[

                    {

                        'bbox': box.tolist(),

                        'confidence':float(prob),

                        'embedding': emb.tolist()

                    }

                    for box, prob, emb inzip(boxes, probs, embeddings)

                ]

            })

  

    return results

```

**Cost:**

-T4 GPU: $0.10/minute

-Processing 100 photos: ~2 minutes = $0.20

-Average event cost: <$0.50

**Alternatives Considered:**

-❌ Replicate.com: $0.02/image (expensive at scale)

-❌ Self-hosted EC2: Need always-on instance

-✅ Modal: Best price for batch processing

### Face Recognition Model

**Choice: FaceNet (InceptionResnetV1) via facenet-pytorch**

**Why:**

-512-dim embeddings (good balance)

-99.6% accuracy on LFW benchmark

-Pre-trained on VGGFace2 (diverse faces)

-MIT licensed

**Model Performance:**

-Inference time: ~50ms/face on T4 GPU

-Embedding size: 2KB per face

-Threshold for matching: >0.6 cosine similarity

**Alternatives Considered:**

-❌ InsightFace (ArcFace): Slightly better accuracy but heavier

-❌ Dlib: Slower, older model

-✅ FaceNet: Best speed/accuracy trade-off

### Client-Side Embedding (Optional Optimization)

**Choice: ONNX.js with FaceNet model**

**Why:**

-Run embedding generation in browser

-Save server costs ($0 per match)

-Faster for user (no upload latency)

**Implementation:**

```typescript

// /lib/face-embedding.ts

import*asortfrom'onnxruntime-web'


letsession:ort.InferenceSession|null=null


exportasyncfunctioninitModel(){

  session=awaitort.InferenceSession.create('/models/facenet.onnx')

}


exportasyncfunctiongenerateEmbedding(imageBlob:Blob):Promise<Float32Array>{

  if (!session) awaitinitModel()

  

  // Preprocess image to 160x160

  consttensor=awaitpreprocessImage(imageBlob)

  

  // Run inference

  constresults=awaitsession.run({ input:tensor})

  

  // Return 512-dim embedding

  returnresults.output.dataasFloat32Array

}

```

---

## Database Schema Deep Dive

### Events Table

```sql

CREATETABLE events (

  id TEXTPRIMARYKEY,                    -- UUID v4

  nameTEXTNOTNULL,                     -- "Sarah's Wedding"

  passcode TEXTNOTNULL,                 -- 6-digit numeric

  created_at INTEGERNOTNULL,            -- Unix timestamp

  expires_at INTEGERNOTNULL,            -- created_at + 30 days

  statusTEXT DEFAULT 'processing',       -- processing|ready|expired|failed

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

### Photos Table

```sql

CREATETABLE photos (

  id TEXTPRIMARYKEY,                    -- UUID v4

  event_id TEXTNOTNULL,

  r2_key TEXTNOTNULL,                   -- Original: events/{event_id}/{photo_id}.jpg

  thumbnail_200_key TEXT,                 -- Thumb: events/{event_id}/thumbs/200/{photo_id}.jpg

  thumbnail_800_key TEXT,

  uploaded_at INTEGERNOTNULL,

  width INTEGER,

  height INTEGER,

  file_size INTEGER,                      -- Bytes

  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE

);


CREATE INDEX idx_photos_event ON photos(event_id);

```

### Faces Table

```sql

CREATETABLE faces (

  id TEXTPRIMARYKEY,                    -- UUID v4

  photo_id TEXTNOTNULL,

  bbox TEXTNOTNULL,                     -- JSON: {"x": 120, "y": 80, "width": 100, "height": 120}

  confidence REALNOTNULL,               -- 0.0 to 1.0

  cluster_id TEXT,                        -- Links similar faces (same person)

  landmarks TEXT,                         -- JSON: eye, nose, mouth coords (optional)

  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE

);


CREATE INDEX idx_faces_photo ON faces(photo_id);

CREATE INDEX idx_faces_cluster ON faces(cluster_id);

```

### Face Embeddings Table

```sql

CREATETABLE face_embeddings (

  id TEXTPRIMARYKEY,

  face_id TEXTNOTNULL UNIQUE,

  embedding BLOB NOTNULL,                -- 512 × 4 bytes = 2048 bytes

  created_at INTEGERNOTNULL,

  FOREIGN KEY (face_id) REFERENCES faces(id) ON DELETE CASCADE

);


-- Vector search index (sqlite-vss)

CREATE VIRTUAL TABLE vec_embeddings USING vss0(

  embedding(512)  -- 512-dimensional float32 vectors

);


-- Insert trigger to keep vss table in sync

CREATE TRIGGER face_embeddings_insert 

AFTERINSERTON face_embeddings

BEGIN

  INSERTINTO vec_embeddings(rowid, embedding)

  VALUES (NEW.rowid, NEW.embedding);

END;

```

### Match Sessions Table (Optional - for analytics)

```sql

CREATETABLE match_sessions (

  id TEXTPRIMARYKEY,

  event_id TEXTNOTNULL,

  user_ip TEXT,

  matched_count INTEGER,

  similarity_threshold REAL,

  created_at INTEGERNOTNULL,

  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE

);

```

---

## API Endpoints & Contracts

### Base URL

-Production: `https://api.GrabPic.app`

-Development: `http://localhost:8787`

### Authentication

-Organizer: JWT token (email-based login)

-Attendee: Event passcode (no account required)

---

###**POST /events**

Create new event

**Request:**

```json

{

  "name":"Tech Conference 2026",

  "organizerEmail":"sarah@example.com",

  "organizerName":"Sarah Johnson",

  "expiryDays":30

}

```

**Response:**

```json

{

  "eventId":"evt_1a2b3c4d",

  "passcode":"123456",

  "uploadUrl":"https://api.GrabPic.app/events/evt_1a2b3c4d/upload",

  "shareUrl":"https://GrabPic.app/e/123456",

  "qrCode":"https://api.GrabPic.app/qr/evt_1a2b3c4d",

  "expiresAt":1741824000

}

```

---

###**POST /events/:eventId/upload**

Get signed URLs for photo upload

**Request:**

```json

{

  "photos":[

    {"filename":"IMG_001.jpg","size":4857344,"type":"image/jpeg"},

    {"filename":"IMG_002.jpg","size":5123456,"type":"image/jpeg"}

  ]

}

```

**Response:**

```json

{

  "uploadUrls":[

    {

      "photoId":"photo_abc123",

      "uploadUrl":"https://r2.GrabPic.app/signed-url-1",

      "filename":"IMG_001.jpg"

    },

    {

      "photoId":"photo_def456",

      "uploadUrl":"https://r2.GrabPic.app/signed-url-2",

      "filename":"IMG_002.jpg"

    }

  ]

}

```

**Client Flow:**

```typescript

// 1. Request signed URLs

const{uploadUrls}=awaitfetch('/events/evt_123/upload',{

  method:'POST',

  body:JSON.stringify({ photos:fileMetadata})

})


// 2. Upload directly to R2

awaitPromise.all(

  uploadUrls.map(({uploadUrl,photoId},i)=>

    fetch(uploadUrl,{

      method:'PUT',

      body:files[i],

      headers:{'Content-Type':files[i].type}

    })

  )

)


// 3. Confirm upload

awaitfetch('/events/evt_123/upload/confirm',{

  method:'POST',

  body:JSON.stringify({ photoIds:uploadUrls.map(u=>u.photoId) })

})

```

---

###**POST /events/:eventId/upload/confirm**

Trigger processing after upload complete

**Request:**

```json

{

  "photoIds":["photo_abc123","photo_def456"]

}

```

**Response:**

```json

{

  "status":"processing",

  "jobId":"job_xyz789",

  "estimatedTime":120  // seconds

}

```

**Backend Action:**

-Trigger Modal.com job webhook

-Update event status to "processing"

---

###**GET /events/:eventId/status**

Check processing status

**Response:**

```json

{

  "status":"ready",  // processing|ready|failed

  "photoCount":250,

  "faceCount":487,

  "progress":100,  // 0-100

  "error":null

}

```

---

###**POST /events/:eventId/match**

Match selfie to event photos

**Request:**

```json

{

  "passcode":"123456",

  "selfieData":"data:image/jpeg;base64,/9j/4AAQSkZJRg...",  // Base64

  "threshold":0.6  // Optional, default 0.6

}

```

**Response:**

```json

{

  "matches":[

    {

      "photoId":"photo_abc123",

      "similarity":0.87,

      "url":"https://cdn.GrabPic.app/evt_123/photo_abc123_800.jpg",

      "thumbnailUrl":"https://cdn.GrabPic.app/evt_123/photo_abc123_200.jpg",

      "width":4032,

      "height":3024,

      "faces":[

        {

          "bbox":{"x":1200,"y":800,"width":400,"height":480},

          "isMatch":true

        }

      ]

    },

    {

      "photoId":"photo_def456",

      "similarity":0.73,

      "url":"https://cdn.GrabPic.app/evt_123/photo_def456_800.jpg",

      "thumbnailUrl":"https://cdn.GrabPic.app/evt_123/photo_def456_200.jpg",

      "width":3024,

      "height":4032,

      "faces":[

        {

          "bbox":{"x":500,"y":1200,"width":350,"height":420},

          "isMatch":true

        }

      ]

    }

  ],

  "totalMatches":42,

  "processingTime":234  // milliseconds

}

```

**Backend Logic:**

```typescript

// /api/routes/match.ts

exportasyncfunctionmatchSelfie(eventId:string,selfieBase64:string,threshold=0.6){

  // 1. Generate embedding from selfie

  constqueryEmbedding=awaitgenerateEmbedding(selfieBase64)

  

  // 2. Vector similarity search

  constresults=awaitdb.execute(`

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

  `, [queryEmbedding,queryEmbedding,eventId,queryEmbedding,threshold])

  

  // 3. Group by photo_id, get photo details

  constphotoIds= [...newSet(results.rows.map(r=>r.photo_id))]

  constphotos=awaitgetPhotoDetails(photoIds)

  

  // 4. Return matched photos with CDN URLs

  returnphotos.map(photo=> ({

    photoId:photo.id,

    similarity:results.rows.find(r=>r.photo_id===photo.id)?.similarity,

    url:getR2SignedUrl(photo.r2_key),

    thumbnailUrl:getR2SignedUrl(photo.thumbnail_800_key),

    // ...

  }))

}

```

---

###**GET /events/:eventId/photos/:photoId**

Get single photo with signed URL

**Response:**

```json

{

  "photoId":"photo_abc123",

  "url":"https://cdn.GrabPic.app/signed-url-expires-in-1h",

  "thumbnailUrl":"https://cdn.GrabPic.app/thumb-signed-url",

  "width":4032,

  "height":3024,

  "faces":[

    {

      "bbox":{"x":1200,"y":800,"width":400,"height":480}

    }

  ]

}

```

---

###**DELETE /events/:eventId**

Delete event and all photos (organizer only)

**Headers:**

```

Authorization: Bearer <jwt_token>

```

**Response:**

```json

{

  "deleted":true,

  "photosDeleted":250,

  "storageFreed":1250000000  // bytes

}

```

---

## Processing Pipeline Details

### Background Job Architecture (Modal.com)

```python

# /ml/main.py

import modal

from typing import List, Dict

import numpy as np

from sklearn.cluster importDBSCAN


stub = modal.Stub(

    "GrabPic-processor",

    secrets=[modal.Secret.from_name("turso-credentials")]

)


# Pre-download model weights in image build

image =(

    modal.Image.debian_slim()

    .pip_install(

        "facenet-pytorch",

        "torch",

        "torchvision",

        "pillow",

        "scikit-learn",

        "requests",

        "libsql-client"

    )

    .run_commands(

        "python -c 'from facenet_pytorch import MTCNN, InceptionResnetV1; MTCNN(); InceptionResnetV1(pretrained=\"vggface2\")'"

    )

)


@stub.function(

    image=image,

    gpu="T4",

    timeout=600,  # 10 minutes max

    memory=4096   # 4GB RAM

)

defprocess_event(event_id:str,photo_urls: List[str])-> Dict:

    """

    Main processing function for an event

    Returns: {

        'faces_detected': int,

        'clusters_found': int,

        'processing_time': float

    }

    """

    import time

    start = time.time()

  

    # Initialize models (cached after first cold start)

    mtcnn = MTCNN(keep_all=True,device='cuda',post_process=False)

    resnet = InceptionResnetV1(pretrained='vggface2').eval().to('cuda')

  

    all_faces =[]

  

    # Process each photo

    for photo_url in photo_urls:

        photo_id = extract_photo_id(photo_url)

        img = download_and_preprocess(photo_url)

      

        # Detect faces

        boxes, probs, landmarks = mtcnn.detect(img,landmarks=True)

      

        if boxes isNone:

            continue

      

        # Extract aligned face tensors

        face_tensors = mtcnn(img)

      

        # Generate embeddings

        with torch.no_grad():

            embeddings = resnet(face_tensors).cpu().numpy()

      

        # Store face data

        for i,(box, prob, landmark, embedding)inenumerate(

            zip(boxes, probs, landmarks, embeddings)

        ):

            face_id =f"{photo_id}_face_{i}"

            all_faces.append({

                'id': face_id,

                'photo_id': photo_id,

                'bbox': box.tolist(),

                'confidence':float(prob),

                'landmarks': landmark.tolist(),

                'embedding': embedding

            })

  

    # Cluster similar faces (same person)

    embeddings_matrix = np.array([f['embedding']for f in all_faces])

    clusters = cluster_faces(embeddings_matrix)

  

    # Assign cluster IDs

    for face, cluster_id inzip(all_faces, clusters):

        face['cluster_id']=f"cluster_{cluster_id}"if cluster_id !=-1elseNone

  

    # Store in database

    store_faces_in_db(event_id, all_faces)

  

    processing_time = time.time()- start

  

    return{

        'faces_detected':len(all_faces),

        'clusters_found':len(set(clusters))-(1if-1in clusters else0),

        'processing_time': processing_time

    }


defcluster_faces(embeddings: np.ndarray,eps=0.4,min_samples=2)-> np.ndarray:

    """

    Cluster face embeddings using DBSCAN

    - eps: max distance for same cluster (lower = stricter)

    - min_samples: min faces to form cluster

    Returns: cluster labels (-1 = noise/unclustered)

    """

    clustering = DBSCAN(

        eps=eps,

        min_samples=min_samples,

        metric='cosine'

    )

    return clustering.fit_predict(embeddings)


defstore_faces_in_db(event_id:str,faces: List[Dict]):

    """Store detected faces and embeddings in Turso"""

    from libsql_client import create_client

  

    db = create_client(

        url=os.environ['TURSO_URL'],

        auth_token=os.environ['TURSO_TOKEN']

    )

  

    # Batch insert faces

    face_records =[

        (f['id'], f['photo_id'], json.dumps(f['bbox']),

         f['confidence'], f['cluster_id'])

        for f in faces

    ]

  

    db.batch([

        "INSERT INTO faces (id, photo_id, bbox, confidence, cluster_id) VALUES (?, ?, ?, ?, ?)"

        for _ in face_records

    ], face_records)

  

    # Batch insert embeddings

    embedding_records =[

        (f['id'], f['id'], f['embedding'].tobytes(),int(time.time()))

        for f in faces

    ]

  

    db.batch([

        "INSERT INTO face_embeddings (id, face_id, embedding, created_at) VALUES (?, ?, ?, ?)"

        for _ in embedding_records

    ], embedding_records)

  

    # Update event status

    db.execute(

        "UPDATE events SET status = 'ready', face_count = ? WHERE id = ?",

        (len(faces), event_id)

    )

```

### Webhook Trigger (Cloudflare Worker)

```typescript

// /api/webhooks/process-event.ts

exportasyncfunctiononUploadComplete(req:Request){

  const{eventId,photoIds}=awaitreq.json()

  

  // Get photo URLs from R2

  constphotoUrls=photoIds.map(id=>

    `https://r2.GrabPic.app/events/${eventId}/${id}.jpg`

  )

  

  // Trigger Modal function

  constmodalUrl="https://modal.com/GrabPic-processor/process-event"

  constresponse=awaitfetch(modalUrl,{

    method:'POST',

    headers:{

      'Authorization':`Bearer ${env.MODAL_TOKEN}`

    },

    body:JSON.stringify({

      event_id:eventId,

      photo_urls:photoUrls

    })

  })

  

  // Update event status to "processing"

  awaitdb.execute(

    "UPDATE events SET status = 'processing' WHERE id = ?",

    [eventId]

  )

  

  returnnewResponse(JSON.stringify({ jobId:response.job_id}),{

    status:202

  })

}

```

---

## Timeline & Milestones

### Week 1-2: Foundation (Setup + Core Backend)

**Goals:**

-Project infrastructure ready

-Database schema finalized

-Core API endpoints working

| Day | Tasks | Deliverable | Hours |

|-----|-------|-------------|-------|

| 1-2 | • Setup repo (monorepo: /frontend, /api, /ml)`<br>`• Configure Turso DB`<br>`• Setup Cloudflare R2`<br>`• Create event schema | DB tables created, R2 bucket ready | 8h |

| 3-4 | • Build POST /events endpoint`<br>`• Implement signed URL generation`<br>`• Event passcode generation | Event creation working | 10h |

| 5-6 | • Setup Modal.com account`<br>`• Create stub face detection function`<br>`• Test face detection on 10 sample photos | Face detection pipeline running | 12h |

| 7 | • Vector search setup (sqlite-vss)`<br>`• Test embedding storage/retrieval | Vector DB operational | 6h |

**Milestone 1:** Backend can create events, upload photos, detect faces ✅

---

### Week 3-4: ML Pipeline + Matching

**Goals:**

-Face detection at scale

-Clustering working

-Selfie matching functional

| Day | Tasks | Deliverable | Hours |

|-----|-------|-------------|-------|

| 8-9 | • Integrate FaceNet model`<br>`• Optimize embedding generation`<br>`• Batch processing for 100+ photos | Process 100 photos in <2min | 10h |

| 10-11 | • Implement DBSCAN clustering`<br>`• Store cluster IDs in DB`<br>`• Tune clustering parameters (eps, min_samples) | Face clustering working | 8h |

| 12-13 | • Build POST /match endpoint`<br>`• Vector similarity search query`<br>`• Test with real selfies | Matching returns results | 10h |

| 14 | • Optimize query performance`<br>`• Add result filtering/ranking`<br>`• Edge case handling (no faces detected) | <500ms match latency | 8h |

**Milestone 2:** Upload photo → take selfie → get matches working end-to-end ✅

---

### Week 5-6: Frontend (Organizer Dashboard)

**Goals:**

-Organizer can create events

-Upload interface working

-Status tracking

| Day | Tasks | Deliverable | Hours |

|-----|-------|-------------|-------|

| 15-16 | • Next.js project setup`<br>`• Setup shadcn/ui`<br>`• Create landing page | Basic frontend running | 8h |

| 17-18 | • Build event creation form`<br>`• Integrate POST /events API`<br>`• Display passcode + QR code | Event creation UI done | 10h |

| 19-20 | • Drag-and-drop upload (react-dropzone)`<br>`• Progress bar UI`<br>`• Call signed URL endpoint | Photo upload working | 12h |

| 21 | • Processing status dashboard`<br>`• Real-time updates (polling/SSE)`<br>`• Error handling | Status tracking live | 6h |

**Milestone 3:** Organizer flow complete (create → upload → monitor) ✅

---

### Week 7-8: Frontend (Attendee Experience)

**Goals:**

-Attendee portal polished

-Camera integration smooth

-Gallery experience great

| Day | Tasks | Deliverable | Hours |

|-----|-------|-------------|-------|

| 22-23 | • Build event access page (/e/:passcode)`<br>`• Passcode validation`<br>`• Event info display | Access page working | 8h |

| 24-25 | • Camera integration (WebRTC)`<br>`• Selfie capture UI`<br>`• Image preprocessing | Camera working | 10h |

| 26-27 | • Gallery grid component`<br>`• Lightbox view`<br>`• Image lazy loading | Gallery displays photos | 12h |

| 28 | • Download functionality`<br>`• Bulk download (zip)`<br>`• Social share buttons | Download working | 6h |

**Milestone 4:** Attendee flow complete (access → selfie → view → download) ✅

---

### Week 9-10: Polish + Optimization

**Goals:**

-Production-ready performance

-Error handling robust

-Analytics tracking

| Day | Tasks | Deliverable | Hours |

|-----|-------|-------------|-------|

| 29-30 | • Image optimization (thumbnails)`<br>`• CDN setup`<br>`• Lazy loading optimization | Fast image loading | 8h |

| 31-32 | • Add loading states everywhere`<br>`• Error boundaries`<br>`• User feedback (toasts, modals) | Polished UX | 10h |

| 33-34 | • SEO optimization`<br>`• OpenGraph tags`<br>`• Analytics (PostHog/Plausible) | SEO + tracking ready | 8h |

| 35 | • Security audit`<br>`• Rate limiting`<br>`• Input validation | Security hardened | 6h |

**Milestone 5:** Production-ready MVP ✅

---

### Week 11-12: Launch Prep + Beta Testing

**Goals:**

-Deploy to production

-Get 10 beta users

-Iterate based on feedback

| Day | Tasks | Deliverable | Hours |

|-----|-------|-------------|-------|

| 36-37 | • Deploy to Vercel (frontend)`<br>`• Deploy to CF Workers (API)`<br>`• Setup monitoring (Sentry) | Live in production | 8h |

| 38-39 | • Create landing page`<br>`• Pricing page (future)`<br>`• Documentation/FAQ | Marketing site ready | 10h |

| 40-42 | • Recruit 10 beta testers`<br>`• Support first events`<br>`• Fix critical bugs | 10 real events processed | 15h |

**Milestone 6:** LAUNCH! 🚀

---

## Total Time Estimate

- **Core Development:** 280 hours (~7 weeks full-time, 12 weeks part-time)
- **Buffer for unknowns:** +30% = 84 hours
- **Total:** ~364 hours (9 weeks full-time, 15 weeks part-time)

**Recommended Schedule:**

-Full-time (40h/week): **9 weeks**

-Part-time (20h/week): **18 weeks** ← Realistic for side project

-Aggressive (60h/week): **6 weeks** ← Burn-out risk

---

## Self-Oriented Goals (Resume + Learning)

### Technical Skills to Master

1.**Vector Databases**

   -Learn: Embedding generation, cosine similarity, indexing

   -Resume: "Implemented vector search achieving 200ms p95 latency on 100K+ embeddings"

2.**Serverless ML**

   -Learn: GPU optimization, cold start reduction, batch processing

   -Resume: "Deployed scalable ML pipeline processing 50K images/month on serverless infrastructure"

3.**Edge Computing**

   -Learn: Cloudflare Workers, distributed data, edge caching

   -Resume: "Built global API on edge network serving requests in <100ms worldwide"

4.**Computer Vision**

   -Learn: Face detection, recognition, clustering algorithms

   -Resume: "Engineered facial recognition system with 85%+ accuracy across diverse datasets"

### Journey-Based Milestones

**Phase 1: "I can build AI-powered backends"**

-[ ] Successfully deploy face detection model

-[ ] Implement vector similarity search

-[ ] Optimize for <$5/event cost

**Phase 2: "I understand production ML systems"**

-[ ] Handle 1000+ photos in single event

-[ ] Achieve 90%+ user satisfaction with matches

-[ ] Zero downtime during processing

**Phase 3: "I can ship products people love"**

-[ ] 50+ real events processed

-[ ] >4.0 star rating from users

-[ ] Viral coefficient >1.5 (users invite others)

**Phase 4: "I'm a technical founder"**

-[ ] $1K+ MRR (product-market fit signal)

-[ ] Featured on Product Hunt / HN

-[ ] Inbound partnership inquiries

---

## Learning Resources

### Face Recognition

-📄 [FaceNet Paper](https://arxiv.org/abs/1503.03832) - Original research

-🎥 [Stanford CS231n - CNNs for Visual Recognition](https://www.youtube.com/playlist?list=PL3FW7Lu3i5JvHM8ljYj-zLfQRF3EO8sYv)

-📦 [facenet-pytorch docs](https://github.com/timesler/facenet-pytorch)

### Vector Databases

-📄 [Understanding Vector Embeddings](https://www.pinecone.io/learn/vector-embeddings/)

-🎥 [Vector Search Explained](https://www.youtube.com/watch?v=klTvEwg3oJ4)

-📦 [sqlite-vss documentation](https://github.com/asg017/sqlite-vss)

### Serverless ML

-📄 [Modal.com docs](https://modal.com/docs)

-🎥 [Building Serverless ML Pipelines](https://www.youtube.com/watch?v=wtp3P6aW_KU)

### Edge Computing

-📄 [Cloudflare Workers docs](https://developers.cloudflare.com/workers/)

-📦 [Hono.js guide](https://hono.dev/)

### System Design

-📄 [Designing Data-Intensive Applications](https://dataintensive.net/) - Book

-🎥 [System Design Primer](https://github.com/donnemartin/system-design-primer)

---

## Risk Mitigation

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |

|------|------------|--------|------------|

| Face detection fails on diverse faces | Medium | High | Test on diverse dataset (age, ethnicity, lighting), use pre-trained VGGFace2 model |

| Vector search too slow | Low | High | Pre-compute clusters, use indexed search, cache common queries |

| R2/Modal downtime | Low | Medium | Graceful degradation, retry logic, status page |

| GPU costs exceed budget | Medium | Medium | Set hard limits in Modal, optimize batch sizes, monitor closely |

| Privacy compliance issues | Medium | Critical | Auto-delete after 30 days, no permanent storage, clear ToS |

### Product Risks

| Risk | Likelihood | Impact | Mitigation |

|------|------------|--------|------------|

| Low organizer adoption | High | Critical | Target early adopters (college clubs, corporate teams), make onboarding dead simple |

| Poor match quality → low trust | Medium | High | Set conservative threshold (0.6), show confidence scores, allow manual search |

| Competitors (Google Photos) | Low | Medium | Focus on event-specific use case, faster than Google's sharing |

| Legal issues (BIPA, GDPR) | Low | Critical | Consult lawyer before launch, implement data controls |

### Execution Risks

| Risk | Likelihood | Impact | Mitigation |

|------|------------|--------|------------|

| Scope creep | High | Medium | Stick to MVP features, park nice-to-haves in backlog |

| Burnout | Medium | High | Cap hours at 25/week, take weekends off, celebrate milestones |

| Analysis paralysis | Medium | Medium | Use this PRD as contract, timebox decisions to 1 hour max |

| Loss of motivation | Medium | High | Share progress publicly (Twitter, blog), recruit beta testers early |

---

## Success Criteria (3-Month Post-Launch)

### Must-Have (Launch Blockers)

-[ ] 10 events processed successfully

-[ ] Average match accuracy >70% (user-reported)

-[ ] Zero data breaches

-[ ] <$10/event operating cost

### Should-Have (Success Signals)

-[ ] 50+ events processed

-[ ] >80% user satisfaction (NPS >40)

-[ ] 20%+ attendees download photos

-[ ] <5% error rate in processing

### Nice-to-Have (Moonshot)

-[ ] 500+ events

-[ ] Featured on Product Hunt

-[ ] $500+ MRR

-[ ] Partnership inquiry from event platform

---

## Competitive Landscape

### Direct Competitors

| Product | Strengths | Weaknesses | Differentiation |

|---------|-----------|------------|-----------------|

|**Google Photos**| Free, good face recognition | Not event-focused, requires all attendees have Google account | We're event-specific, no account needed |

|**Eversnap**| Established (weddings) | Expensive ($99/event), manual sorting | 10x cheaper, automated |

|**Photobooth apps**| Popular at events | Don't solve distribution problem | We handle full workflow |

|**Photographer portals**| Professional quality | Expensive, manual tagging | Automated, accessible |

### Indirect Competitors

-Facebook event albums (manual tagging)

-WeTransfer / Dropbox (no organization)

-Physical photo sharing (inefficient)

### Competitive Moat

1.**Technical:** Pre-computed embeddings = instant results

2.**UX:** Single selfie vs. scrolling hundreds of photos

3.**Cost:** Serverless = profitable at $3-5/event

4.**Network:** First organizer brings all attendees

---

## Monetization Strategy (Post-MVP)

### Pricing Tiers

**Free Tier** (Customer Acquisition)

-100 photos/event

-30-day retention

-Watermarked downloads

- **Price:** Free
- **Target:** Small parties, trials

**Pro Tier** (Primary Revenue)

-Unlimited photos

-90-day retention

-No watermarks

-Priority processing

-Email delivery

- **Price:** $9.99/event or $29/month unlimited
- **Target:** Weddings, corporate events

**Enterprise** (High-Value)

-White-label API

-Custom retention

-Analytics dashboard

-Dedicated support

- **Price:** Custom (starts $299/month)
- **Target:** Event companies, venues

### Revenue Projections (Optimistic)

| Month | Events (Free) | Events (Pro) | MRR | Notes |

|-------|---------------|--------------|-----|-------|

| 1-3 | 50 | 5 | $50 | Beta testing |

| 4-6 | 100 | 20 | $200 | Word of mouth |

| 7-9 | 200 | 50 | $500 | Viral growth |

| 10-12 | 400 | 100 | $1,000 | Product-market fit |

**Break-even:** ~30 paid events/month ($300 MRR) covers infrastructure

---

## Privacy & Compliance

### GDPR Compliance

-[ ] **Right to access:** Export all user data

-[ ] **Right to deletion:** One-click event deletion

-[ ] **Data minimization:** Only store necessary face embeddings

-[ ] **Purpose limitation:** Clear ToS on face data usage

-[ ] **Storage limitation:** Auto-delete after 30 days

### BIPA Compliance (Illinois)

-[ ] **Written consent:** Checkbox before selfie capture

-[ ] **Retention policy:** Clearly stated 30-day limit

-[ ] **No selling data:** Never share embeddings with 3rd parties

### Implementation

```typescript

// Consent flow

constConsentModal=()=> (

  <Modal>

    <h2>PrivacyNotice</h2>

    <p>We'll analyze your selfie to find your photos.

       Yourfacedatais:</p>

    <ul>

      <li>Usedonlyforthisevent</li>

      <li>Deletedafter30days</li>

      <li>Neversharedwithanyone</li>

    </ul>

    <Checkboxrequired>

      Iconsenttofacialrecognitionforthisevent

    </Checkbox>

  </Modal>

)

```

---

## Open Questions (To Resolve in Week 1)

### Technical

1.**Client-side vs. server-side embedding for selfies?**

   -Option A: ONNX.js in browser ($0 cost, privacy-friendly)

   -Option B: Server endpoint (consistent quality, easier debugging)

- **Decision:** Start with server, add client option in Phase 2

2.**Clustering algorithm parameters?**

   -DBSCAN eps: 0.3-0.5? (test on real data)

   -Min samples: 2 or 3?

- **Decision:** A/B test, let users adjust threshold

3.**Thumbnail sizes?**

   -200px (grid) + 800px (preview) enough?

- **Decision:** Yes, add 1600px for download in Phase 2

### Product

1.**Should free tier have watermarks?**

   -Pro: Incentive to upgrade

   -Con: Poor UX, might hurt growth

- **Decision:** No watermark, limit to 100 photos instead

2.**Manual face tagging fallback?**

   -If ML fails, let user manually select photos?

- **Decision:** Phase 2 feature, focus on ML quality first

---

## Development Environment Setup

### Prerequisites

```bash

# Node.js (v20+)

node--version  # v20.10.0


# pnpm (faster than npm)

npminstall-gpnpm


# Wrangler (Cloudflare CLI)

npminstall-gwrangler


# Modal CLI

pipinstallmodal

```

### Monorepo Structure

```

GrabPic/

├── apps/

│   ├── web/                 # Next.js frontend

│   │   ├── src/

│   │   │   ├── app/         # App router

│   │   │   ├── components/  # React components

│   │   │   └── lib/         # Utilities

│   │   └── package.json

│   └── api/                 # Cloudflare Workers

│       ├── src/

│       │   ├── routes/      # API endpoints

│       │   └── index.ts     # Hono app

│       └── wrangler.toml

├── packages/

│   ├── db/                  # Turso client & schema

│   ├── types/               # Shared TypeScript types

│   └── config/              # Shared configs (tsconfig, eslint)

├── ml/

│   ├── processor.py         # Modal functions

│   └── requirements.txt

├── pnpm-workspace.yaml

└── package.json

```

### Initial Setup Commands

```bash

# Create monorepo

pnpminit

pnpmadd-Dwturbotypescript


# Create Next.js app

cdapps/web

pnpmcreatenext-app@latest.--typescript--tailwind--app


# Create Cloudflare Worker

cdapps/api

pnpmcreatecloudflare@latest.----framework=hono


# Setup Turso

brewinstalltursodatabase/tap/turso

tursoauthsignup

tursodbcreateGrabPic-dev

tursodbshowGrabPic-dev  # Get URL + token


# Setup Modal

modalsetup

modaltokennew

```

---

## Deployment Checklist

### Pre-Launch (Week 11)

-[ ] Setup custom domain (GrabPic.app)

-[ ] Configure DNS (Cloudflare)

-[ ] SSL certificates (auto via CF)

-[ ] Environment variables in Vercel

-[ ] Environment variables in Wrangler

-[ ] Sentry error tracking

-[ ] PostHog analytics

-[ ] Setup status page (status.GrabPic.app)

### Launch Day (Week 12)

-[ ] Deploy frontend to Vercel

-[ ] Deploy API to CF Workers

-[ ] Deploy ML functions to Modal

-[ ] Smoke test full flow (create → upload → match)

-[ ] Share on Twitter, LinkedIn

-[ ] Post to r/SideProject, HN Show

-[ ] Email 10 beta testers

### Post-Launch (Week 13+)

-[ ] Monitor error rates (Sentry)

-[ ] Monitor costs (AWS/CF dashboards)

-[ ] User feedback collection (Typeform)

-[ ] Weekly bug fixes

-[ ] Monthly feature releases

---

## Final Thoughts from "Senior PM"

This is a **solid 8.5/10 idea** with clear technical differentiation and a painful user problem. Here's why you should build this:

### Why This Will Work

1.**Obvious pain point:** Everyone's been in this situation

2.**Simple value prop:** "Take a selfie, get your photos"

3.**Network effects:** One organizer = 50-200 attendees

4.**Hard to copy:** Requires ML expertise + infrastructure knowledge

5.**Multiple revenue streams:** B2C (events) + B2B (photographers/venues)

### Why This Might Fail

1.**Privacy concerns:** Some people uncomfortable with face recognition

2.**Accuracy anxiety:** If matches are poor, trust evaporates

3.**Distribution challenge:** How do organizers discover you?

4.**Behavioral change:** Organizers used to Google Drive

### How to Maximize Success

1.**Start niche:** Target tech conferences or college events (early adopters)

2.**Obsess over quality:** 85%+ accuracy or bust

3.**Build in public:** Tweet progress, attract beta testers

4.**Optimize for virality:** QR codes, referral incentives

5.**Talk to users weekly:** Ship what they actually need

### Your Competitive Advantage

You understand both the ML stack AND modern web infrastructure. Most ML engineers can't ship products; most web devs avoid ML. You can do both. **That's your moat.**

Now stop reading and start building. Week 1 starts Monday. Set a recurring calendar reminder: "GrabPic Dev Time" 20h/week. See you at launch. 🚀

---

**Document Status:** Ready for execution

**Next Step:** Create GitHub repo, copy this PRD to README.md, start Week 1 tasks

**Questions?** DM me or leave comments in issues
