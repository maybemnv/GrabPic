# GrabPic

Facial recognition-powered event photo distribution. Organizers upload photos once; attendees take a selfie and get a personalized gallery in under 5 seconds.

## Architecture

```mermaid
graph TB
    subgraph Client
        WEB[Next.js Frontend<br/>Vercel]
    end

    subgraph Edge
        API[Cloudflare Workers<br/>Hono.js]
    end

    subgraph Storage
        R2[Cloudflare R2<br/>Photos + Thumbnails]
        DB[Turso<br/>SQLite + Vector]
    end

    subgraph Processing
        MODAL[Modal.com<br/>GPU Serverless]
    end

    WEB -->|HTTPS| API
    API -->|Signed URLs| R2
    API -->|Queries| DB
    API -->|Triggers| MODAL
    MODAL -->|Read/Write| R2
    MODAL -->|Store embeddings| DB
    WEB -->|Direct upload| R2
```

## Project Structure

```
GrabPic/
├── backend/          # Python API + ML processing
│   ├── main.py
│   ├── ML/           # Modal.com serverless functions
│   └── pyproject.toml
├── frontend/         # Next.js app
├── docs/             # PRD and documentation
└── AGENTS.md         # AI agent guidelines
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Backend API | Cloudflare Workers + Hono.js |
| Database | Turso (libSQL with vector search) |
| Storage | Cloudflare R2 |
| ML Processing | Modal.com (GPU serverless) |
| Face Recognition | FaceNet / ArcFace (512-dim embeddings) |
| Clustering | DBSCAN |

## Workflows

**Upload and Process**

```mermaid
sequenceDiagram
    Organizer->>API: Upload photos
    API->>R2: Return signed URLs
    Organizer->>R2: Direct upload
    Organizer->>API: Confirm upload
    API->>Modal: Trigger processing job
    Modal->>R2: Download originals
    Modal->>Modal: Detect faces (MTCNN)
    Modal->>Modal: Generate embeddings (FaceNet)
    Modal->>Modal: Cluster (DBSCAN)
    Modal->>DB: Store faces + embeddings
    Modal->>API: Webhook complete
    API->>DB: Update event status
```

**Selfie Match**

```mermaid
sequenceDiagram
    Attendee->>API: POST /match with selfie
    API->>API: Generate embedding
    API->>DB: Cosine similarity search
    DB->>API: Top-N matching photos
    API->>R2: Generate signed URLs
    API->>Attendee: Return matched gallery
```

## Getting Started

```bash
# Install dependencies
pnpm install
pip install modal

# Set up databases
turso db create grabpic-dev
turso db show grabpic-dev

# Run API
cd backend && python main.py

# Run frontend
cd frontend && pnpm dev
```
