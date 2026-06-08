# FaceFind - Tech Stack Decisions (Optimized for Cost + Speed)

**Version:** 1.0
**Date:** February 9, 2026
**Owner:** Product Engineering
**Status:** Planning Phase

---

## Frontend
**Choice: Next.js 14 (App Router) + TypeScript**

**Why:**
- Server Components for SEO
- Built-in image optimization
- Vercel deployment (free tier)
- Great DX with hot reload

**Alternatives Considered:**
- ❌ React + Vite: No SSR, worse SEO
- ❌ SvelteKit: Smaller ecosystem
- ✅ Next.js: Best balance

**Key Libraries:**
```json
{
  "next": "14.x",
  "react": "18.x",
  "tailwindcss": "3.x",
  "shadcn/ui": "latest",
  "react-dropzone": "14.x",
  "onnxruntime-web": "1.17.x"  // Client-side embedding
}
```

## Backend API
**Choice: Hono.js on Cloudflare Workers**

**Why:**
- Edge deployment (low latency globally)
- Generous free tier (100K req/day)
- TypeScript-first
- Tiny bundle size (<50KB)
- Built-in CORS, validation

**Alternatives Considered:**
- ❌ Express.js: Need dedicated server (cost)
- ❌ FastAPI: Python runtime overhead
- ✅ Hono + CF Workers: Fastest, cheapest

**Architecture:**
```typescript
// /src/api/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { events } from './routes/events'
import { match } from './routes/match'

const app = new Hono()

app.use('/*', cors())
app.route('/events', events)
app.route('/match', match)

export default app
```

## Database
**Choice: Turso (LibSQL with Vector Extension)**

**Why:**
- SQLite-based (fast reads)
- Edge replicas (low latency)
- Vector search built-in (sqlite-vss)
- Free tier: 8GB storage, 1B row reads/month
- TypeScript SDK

**Schema:**
```sql
-- events table
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  passcode TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT DEFAULT 'processing', -- processing|ready|expired
  photo_count INTEGER DEFAULT 0,
  organizer_email TEXT
);

-- photos table
CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  thumbnail_key TEXT,
  uploaded_at INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- faces table (detected faces in photos)
CREATE TABLE faces (
  id TEXT PRIMARY KEY,
  photo_id TEXT NOT NULL,
  bbox TEXT NOT NULL, -- JSON: {x, y, width, height}
  confidence REAL NOT NULL,
  cluster_id TEXT, -- Group similar faces
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
);

-- face_embeddings table (vector search)
CREATE TABLE face_embeddings (
  id TEXT PRIMARY KEY,
  face_id TEXT NOT NULL UNIQUE,
  embedding BLOB NOT NULL, -- 512-dim float32 vector
  FOREIGN KEY (face_id) REFERENCES faces(id) ON DELETE CASCADE
);

-- Create vector index
CREATE VIRTUAL TABLE vec_embeddings USING vss0(
  embedding(512)
);
```

**Alternatives Considered:**
- ❌ Pinecone: $70/month for production
- ❌ PostgreSQL + pgvector: Need managed instance ($25/mo+)
- ✅ Turso: Free tier sufficient, scales linearly

## Object Storage
**Choice: Cloudflare R2**

**Why:**
- $0.015/GB storage (10x cheaper than S3)
- Zero egress fees (S3 charges $0.09/GB)
- S3-compatible API
- Tight integration with Workers

**Cost Projection:**
- 100 events/month × 500 photos × 5MB = 250GB
- Storage: 250GB × $0.015 = $3.75/month
- Egress (S3 equivalent): 250GB × $0.09 = $22.50/month
- **Savings with R2: $18.75/month**

**Alternatives Considered:**
- ❌ AWS S3: Expensive egress
- ❌ Backblaze B2: Slower global delivery
- ✅ R2: Best price + performance

## ML Processing
**Choice: Modal.com (Serverless GPU)**

**Why:**
- Pay-per-second GPU billing
- Auto-scales to zero
- Python-based (easy ML libs)
- Fast cold starts (<10s)
- Free tier: $30 credits/month

**Face Detection Pipeline:**
```python
# /ml/processor.py
import modal
from facenet_pytorch import MTCNN, InceptionResnetV1
import torch

stub = modal.Stub("facefind-processor")

@stub.function(
    gpu="T4",
    image=modal.Image.debian_slim().pip_install(
        "facenet-pytorch", "torch", "pillow"
    )
)
def process_event_photos(event_id: str, photo_urls: list[str]):
    device = torch.device('cuda')
    mtcnn = MTCNN(keep_all=True, device=device)
    resnet = InceptionResnetV1(pretrained='vggface2').eval().to(device)

    results = []
    for url in photo_urls:
        # Download image
        img = download_image(url)

        # Detect faces
        boxes, probs = mtcnn.detect(img)

        if boxes is not None:
            # Extract face tensors
            faces = mtcnn(img)

            # Generate embeddings
            embeddings = resnet(faces).detach().cpu().numpy()

            results.append({
                'photo_url': url,
                'faces': [
                    {
                        'bbox': box.tolist(),
                        'confidence': float(prob),
                        'embedding': emb.tolist()
                    }
                    for box, prob, emb in zip(boxes, probs, embeddings)
                ]
            })

    return results
```

**Cost:**
- T4 GPU: $0.10/minute
- Processing 100 photos: ~2 minutes = $0.20
- Average event cost: <$0.50

**Alternatives Considered:**
- ❌ Replicate.com: $0.02/image (expensive at scale)
- ❌ Self-hosted EC2: Need always-on instance
- ✅ Modal: Best price for batch processing

## Face Recognition Model
**Choice: FaceNet (InceptionResnetV1) via facenet-pytorch**

**Why:**
- 512-dim embeddings (good balance)
- 99.6% accuracy on LFW benchmark
- Pre-trained on VGGFace2 (diverse faces)
- MIT licensed

**Model Performance:**
- Inference time: ~50ms/face on T4 GPU
- Embedding size: 2KB per face
- Threshold for matching: >0.6 cosine similarity

**Alternatives Considered:**
- ❌ InsightFace (ArcFace): Slightly better accuracy but heavier
- ❌ Dlib: Slower, older model
- ✅ FaceNet: Best speed/accuracy trade-off

## Client-Side Embedding (Optional Optimization)
**Choice: ONNX.js with FaceNet model**

**Why:**
- Run embedding generation in browser
- Save server costs ($0 per match)
- Faster for user (no upload latency)

**Implementation:**
```typescript
// /lib/face-embedding.ts
import * as ort from 'onnxruntime-web'

let session: ort.InferenceSession | null = null

export async function initModel() {
  session = await ort.InferenceSession.create('/models/facenet.onnx')
}

export async function generateEmbedding(imageBlob: Blob): Promise<Float32Array> {
  if (!session) await initModel()

  // Preprocess image to 160x160
  const tensor = await preprocessImage(imageBlob)

  // Run inference
  const results = await session.run({ input: tensor })

  // Return 512-dim embedding
  return results.output.data as Float32Array
}
```