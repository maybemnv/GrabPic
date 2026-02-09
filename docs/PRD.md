# Product Requirements Document (PRD)

## Project: Private Event Face-Based Photo Retrieval Platform

Author: Manav
Role Assumption: Solo Founder, Engineer, PM
Document Version: v1.0
Status: Approved for Execution
Start Date: TBD
Target MVP Completion: 4 Weeks

---

## 1. Problem Statement

Event organizers and photographers often upload thousands of photos after an event. Attendees must manually search through large folders to find their own pictures, leading to poor experience, wasted time, and dissatisfaction.

There is no simple, privacy-respecting, event-scoped solution that allows users to retrieve only their own photos instantly without manual tagging or searching.

---

## 2. Product Vision

Build a **private, event-scoped facial recognition system** that allows users to retrieve all photos containing their face using a single selfie, without manual tagging, global face databases, or privacy risks.

This product should feel instant, magical, and trustworthy.

---

## 3. Goals

### 3.1 Product Outcomes

- Reduce photo retrieval time from hours to seconds
- Zero manual tagging required
- Event-scoped privacy guaranteed
- Scales from small events to thousands of attendees

### 3.2 Personal and Journey-Based Goals

- Ship a production-grade ML-backed SaaS system end to end
- Demonstrate system design, async pipelines, vector search, and privacy-first ML
- Build discipline via strict execution timelines
- Reduce decision fatigue by freezing architecture upfront
- Enter deep implementation flow state quickly

### 3.3 Resume Impact

- Designed and built an end-to-end ML system with async processing
- Implemented face embedding, clustering, and vector search pipelines
- Built scalable backend APIs with background workers
- Designed privacy-first data isolation architecture
- Deployed a cost-optimized ML system

---

## 4. User Personas

### Organizer

- Uploads event photos
- Wants easy distribution
- Needs privacy and control

### Attendee

- Wants only their photos
- Does not want manual searching
- Wants fast and simple access

---

## 5. Core Features and Functionality

### 5.1 Event Space Management

- Create private event space
- Event-level access credentials
- Event expiration and purge

### 5.2 Photo Upload

- Bulk upload photos
- Async background processing
- Upload progress tracking

### 5.3 Face Processing Pipeline

- Face detection
- Face embedding generation
- Face clustering per event
- Mapping of cluster IDs to photo IDs

### 5.4 Attendee Retrieval

- Selfie capture
- Face embedding
- Nearest neighbor matching within event
- Return all matching photos

### 5.5 Privacy and Controls

- No cross-event face matching
- No selfie storage
- Event data deletion
- Organizer purge controls

---

## 6. Non-Goals

- No global identity recognition
- No public sharing
- No social features
- No real-time video processing

---

## 7. Technical Architecture

### 7.1 High-Level System Architecture

Components:

- API Server
- Background Worker Service
- Object Storage
- Vector Store
- Relational Database
- Message Queue

Flow:

1. Upload photos
2. Enqueue processing jobs
3. Worker extracts faces and embeddings
4. Store embeddings scoped to event
5. Cluster embeddings
6. Attendee submits selfie
7. Vector similarity search
8. Return photo URLs

---

## 8. Tech Stack

### Backend

- Python
- FastAPI
- Pydantic
- SQLAlchemy

### ML

- MediaPipe or RetinaFace for detection
- ArcFace or FaceNet embeddings
- DBSCAN or HDBSCAN clustering

### Storage

- Object Storage (S3-compatible)
- PostgreSQL for metadata
- Vector DB (FAISS or equivalent)

### Async Processing

- Message Queue (Redis or SQS-style)
- Worker pool

### Infra

- Docker
- Single GPU node for preprocessing
- CPU-only API servers

---

## 9. Core Concepts

### Event-Scoped Isolation

- Each event has its own embedding space
- No shared vectors across events

### Async First

- Uploads never block
- Processing is background-only

### Cost Efficiency

- GPU only for preprocessing
- Retrieval runs on CPU
- Downscaled images for detection

---

## 10. Database Design

### Tables

#### events

- id
- name
- created_at
- expires_at

#### photos

- id
- event_id
- storage_url

#### faces

- id
- event_id
- photo_id
- embedding_vector
- cluster_id

---

## 11. API Design

### Organizer APIs

- POST /events
- POST /events/{id}/upload
- GET /events/{id}/status
- DELETE /events/{id}

### Attendee APIs

- POST /events/{id}/selfie
- GET /events/{id}/photos

---

## 12. Execution Plan

### Phase 1: Planning and Freeze Architecture (2 Days)

- Finalize PRD
- Lock tech stack
- Lock schema and APIs
- No new decisions after this phase

### Phase 2: Core Backend and Storage (5 Days)

- Event and photo APIs
- Storage integration
- Auth and access control

### Phase 3: ML Pipeline (7 Days)

- Face detection
- Embedding extraction
- Clustering logic
- Vector search

### Phase 4: Retrieval Flow (5 Days)

- Selfie capture API
- Matching logic
- Response optimization

### Phase 5: Hardening and Polish (4 Days)

- Error handling
- Privacy guarantees
- Performance tuning

### Phase 6: Deployment (3 Days)

- Dockerization
- Infra setup
- End-to-end testing

---

## 13. Timeline and Milestones

Week 1

- Architecture locked
- Backend skeleton complete

Week 2

- ML preprocessing pipeline functional

Week 3

- Retrieval working end to end

Week 4

- Stable MVP deployed

---

## 14. Sources and References

### Face Recognition

- ArcFace papers
- FaceNet architecture docs

### System Design

- Async task processing patterns
- Vector search fundamentals

### Privacy

- GDPR face data guidelines
- Event-scoped data isolation practices

---

## 15. Success Metrics

- Selfie to photo retrieval under 2 seconds
- 95 percent face detection success rate
- Zero cross-event leakage
- MVP shipped within timeline

---

## 16. Final Note

This project is execution-heavy, not research-heavy.
All major decisions are locked in this document.
From here on, success depends on disciplined implementation, not ideation.

High focus. High output. No thrashing.
