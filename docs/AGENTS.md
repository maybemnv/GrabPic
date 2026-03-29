# AGENTS.md — GrabPic

> This file governs how AI agents (Claude Code, Cursor, Copilot, etc.) should reason about,
> navigate, and contribute to the GrabPic codebase. Treat it as the engineering constitution
> for this project. Read it fully before touching any file.

---

## What GrabPic Is

GrabPic is a facial recognition-powered event photo distribution platform.

- **Organizers** upload bulk event photos once. The system processes them asynchronously.
- **Attendees** take a single selfie. They get a personalized gallery of every photo they appear in — in under 5 seconds.
- The core technical insight: replace O(n) manual photo-hunting with a vector similarity search against pre-computed face embeddings.

**North Star Metric:** Time from selfie → photo gallery < 5 seconds.

---

## Monorepo Structure

```
grabpic/
├── apps/
│   ├── web/          # Next.js 14+ (App Router). Organizer dashboard + attendee portal.
│   └── api/          # Cloudflare Workers + Hono.js. Edge API layer.
├── packages/
│   ├── db/           # Turso (libSQL) client, schema, migrations
│   ├── types/        # Shared TypeScript types across apps
│   └── config/       # Shared tsconfig, eslint configs
├── ml/
│   ├── processor.py  # Modal.com GPU serverless functions
│   └── requirements.txt
├── pnpm-workspace.yaml
└── AGENTS.md         # You are here
```

**Rule:** Never import from `apps/` into `packages/`. Packages are shared primitives — they must not depend on app-level concerns.

---

## Architecture Decisions (and Why)

### Edge API: Cloudflare Workers + Hono.js
- All API routes live in `apps/api/`. Never add backend logic to Next.js API routes.
- Workers run at the edge — keep handlers stateless and fast. No blocking I/O.
- Use Hono's `c.env` for all environment bindings. Never `process.env` in Workers.

### ML Processing: Modal.com (GPU Serverless)
- Face detection: MTCNN or RetinaFace
- Embedding generation: ArcFace (512-dim vectors)
- Clustering: DBSCAN (eps: 0.3–0.5, test empirically per event)
- **Never run ML inference synchronously in the API layer.** All processing is async — enqueue a job, return immediately, poll for status.
- Modal functions are defined in `ml/processor.py`. Do not inline ML logic anywhere else.

### Storage: Cloudflare R2
- Original photos → R2 (`originals/`)
- Thumbnails → R2 (`thumbs/200/`, `thumbs/800/`)
- Signed URLs for all uploads. Never expose raw R2 bucket URLs to clients.
- Thumbnail sizes: 200px (grid view), 800px (preview). 1600px added in Phase 2.

### Database: Turso (libSQL / SQLite at edge)
- Schema lives in `packages/db/schema.ts`
- All queries go through the Turso client — never raw SQL strings in route handlers
- Face embeddings stored as BLOB (serialized Float32Array). Vector similarity computed application-side for MVP; migrate to a dedicated vector DB (e.g. Turbopuffer) at scale.

### Frontend: Next.js App Router
- Organizer dashboard and attendee portal are separate route groups: `(organizer)` and `(attendee)`
- Camera access via `MediaDevices API` / WebRTC — selfie capture is entirely client-side
- No `use client` unless absolutely necessary. Prefer React Server Components.

---

## Core Workflows (Agent Must Understand These)

### Upload → Process Flow
```
Organizer uploads photos
  → API returns signed R2 URLs
  → Client uploads directly to R2 (bypasses Worker)
  → Worker triggers Modal job (async)
  → Modal: detect faces → generate ArcFace embeddings → DBSCAN cluster → store in Turso
  → Organizer dashboard polls /events/:id/status
```

### Selfie → Match Flow
```
Attendee takes selfie
  → POST /events/:id/match with selfie image
  → Worker: generate embedding server-side (ArcFace, same model as processing)
  → Cosine similarity search against stored embeddings in Turso
  → Return top-N matching photo IDs
  → Client fetches signed R2 thumbnail URLs for matched photos
```

**Critical:** The selfie embedding MUST use the same model weights as the batch processor. Any drift between models breaks matching. Never swap models without re-processing the event.

---

## What Agents Should and Shouldn't Do

### DO
- Follow the monorepo boundary rules strictly
- Keep Cloudflare Worker handlers thin — orchestration only, no business logic inline
- Write TypeScript strictly. `strict: true` in all tsconfigs. No `any`.
- Use Zod for all API input validation, both in Workers and frontend forms
- Add a comment explaining *why* for any non-obvious decision (clustering params, threshold values, etc.)
- When adding a new route, also add the corresponding TypeScript type in `packages/types`
- Prefer `fetch`-based polling over websockets for job status (MVP scope)

### DON'T
- Don't run DBSCAN or any ML inference synchronously inside a Worker handler
- Don't store face embeddings in R2 — they live in Turso for queryability
- Don't use Next.js API routes for anything — all backend logic is in Cloudflare Workers
- Don't generate thumbnails client-side — always server-side via Modal after upload
- Don't expose event codes in URLs — codes are entered via form, never as query params
- Don't add watermarks in Phase 1 — free tier is limited by photo count (100), not watermarks
- Don't use `console.log` in production Workers — use structured logging with `c.env.LOG_LEVEL`

---

## Privacy & Compliance (Non-Negotiable)

GrabPic processes biometric data. These rules are hardcoded into product decisions:

- **Consent gate:** Selfie capture is blocked until user explicitly checks BIPA/GDPR consent modal. This is not optional and must not be removed or A/B tested away.
- **Auto-expiry:** All event data (photos, embeddings, clusters) auto-deletes 30 days post-event. This is enforced by a scheduled Cloudflare Worker cron job, not a manual process.
- **Embedding isolation:** Face embeddings are scoped to an event. Never share or cross-reference embeddings across events.
- **No third-party embedding sharing:** Embeddings are never sent to any external analytics, logging, or data pipeline. Strip them from all logs.
- **Right to deletion:** `DELETE /events/:id` must cascade-delete R2 objects, Turso rows, and any queued Modal jobs for that event.

---

## Code Style & Conventions

- **Formatter:** Prettier with defaults. Run before every commit.
- **Linter:** ESLint with `@typescript-eslint` strict rules.
- **Naming:**
  - Files: `kebab-case.ts`
  - Components: `PascalCase.tsx`
  - DB columns: `snake_case`
  - API routes: RESTful, plural nouns (`/events`, `/events/:id/photos`)
- **Error handling:** All Worker routes return `{ error: string, code: string }` on failure. Never leak stack traces to clients.
- **Environment variables:** Validated with Zod on startup in both `apps/web` and `apps/api`. A missing env var should crash loudly at boot, not silently at runtime.

---

## ML-Specific Guidelines

- DBSCAN `eps` parameter is not a constant — it should be treated as a tunable config per event, stored in the event record.
- ArcFace produces 512-dim L2-normalized vectors. Cosine similarity = dot product for normalized vectors. Don't add unnecessary normalization steps.
- Face detection confidence threshold: 0.9 minimum. Discard low-confidence detections rather than embedding them — they corrupt clusters.
- If DBSCAN produces >500 clusters for an event, surface a warning to the organizer. It likely means bad lighting / very large event — not a bug.
- Model weights are pinned in `ml/requirements.txt`. Never float to `latest`.

---

## Phase Scope (What's In vs Out)

### Phase 1 (MVP) — IN SCOPE
- Bulk upload (up to 1000 photos/event)
- Async face processing pipeline
- Selfie-based matching
- 200px + 800px thumbnails
- 6-digit event code + QR code
- 30-day auto-expiry
- Free tier: 100 photos max

### Phase 2 — OUT OF SCOPE FOR NOW (don't build it, don't stub it)
- Client-side ONNX embedding (selfie privacy mode)
- Multi-face search ("me AND friends")
- Privacy blur on downloaded photos
- Email delivery of gallery links
- Manual face tagging fallback
- 1600px download thumbnails

**Rule:** If a feature isn't in Phase 1, don't add it. Don't add `// TODO: Phase 2` stubs that complicate the codebase. Phase 2 gets its own branch.

---

## How I Work With AI Agents

- I prototype fast, then refactor with agent help. Don't over-engineer first drafts.
- When I ask to "add a feature," first check if it violates any rule in this file. If it does, flag it before writing code.
- When I ask to "fix a bug," explain the root cause before patching. Don't mask symptoms.
- Suggest the minimal change that solves the problem. Avoid rewriting files I didn't ask you to touch.
- If something in this AGENTS.md conflicts with what I've asked, point out the conflict. Don't silently pick one.
- Prefer explicit over implicit. If you're making an assumption, say so.

---

*Last updated: March 2026 — Manav*
