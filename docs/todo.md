# GrabPic — Project Todo

## Monorepo Foundation

- [x] pnpm workspace + Turborepo config
- [x] Shared TypeScript config (packages/config)
- [x] `apps/` and `packages/` directory structure
- [x] .gitignore with node_modules, .turbo, .env, .next
- [x] eslint + prettier setup

## Shared Packages

### packages/types
- [x] Event, Photo, Face, FaceEmbedding interfaces
- [x] API request/response contracts (CreateEvent, Upload, Match, etc.)
- [x] ApiError, BBox, FaceLandmarks types
- [x] Zod schema validation in API routes

### packages/db
- [x] Turso schema: events, photos, faces, face_embeddings, match_sessions
- [x] DB client factory (createDbClient)
- [x] Migration runner (migrate function)
- [x] Indexes on passcode, status, expires_at, photo_id, cluster_id, event_id

### packages/config
- [x] Shared tsconfig.base.json
- [x] Shared eslint config

## Landing Page (root `/`)

- [x] Cinematic dark theme (black bg, warm cream `#E1E0CC`/`#DEDBC8` accents)
- [x] Hero section with full-screen video + noise overlay + gradient
- [x] Giant "GrabPic" pull-up heading with asterisk
- [x] CTA buttons → `/organizer` (primary) and `/attendee` (secondary)
- [x] About section with scroll-linked character opacity text reveal
- [x] Features section: 4-column grid (video card + 3 feature cards)
- [x] How It Works section: 4-step numbered flow
- [x] Privacy section with biometric data protection messaging
- [x] Footer with product links, contact, legal
- [x] Smooth fixed navbar (transparent → solid on scroll, backdrop-blur)
- [x] Mobile hamburger menu
- [x] Google Fonts (Almarai + Instrument Serif)
- [x] Noise texture SVG utilities (`.noise-overlay`, `.bg-noise`)
- [x] Framer-motion animations (pull-up text, fade-in, staggered cards)
- [x] Lucide-react icons (ArrowRight, Check, Menu, etc.)

## API Layer (apps/api)

### Routes
- [x] POST /events — create event (Zod validated)
- [x] GET /events/:id — get event
- [x] GET /events/:id/status — processing status
- [x] DELETE /events/:id — delete event + cascade
- [x] POST /events/:id/upload — generate signed R2 URLs
- [x] POST /events/:id/upload/confirm — trigger Modal processing
- [x] POST /events/:id/match — selfie matching with passcode auth

### Infrastructure
- [x] Hono.js app with CORS + logger middleware
- [x] Env interface (PHOTOS R2 bucket, TURSO, MODAL, LOG_LEVEL)
- [x] wrangler.toml with R2 binding
- [ ] wrangler.toml — fill in actual D1 database_id
- [ ] wrangler.toml — fill in MODAL_TOKEN and MODAL_WEBHOOK_URL

## Frontend (apps/web)

### Organizer Dashboard (`/organizer`)
- [x] Dark theme matching landing page
- [x] Event creation form → real API (`POST /events`)
- [x] Photo upload → signed URLs → direct R2 upload
- [x] Upload confirm + auto-poll status every 5s
- [x] Passcode copy button + share link
- [x] Error handling with visible error box

### Attendee Portal (`/attendee`)
- [x] Dark theme matching landing page
- [x] Event code + ID entry → `GET /events/:id` validation
- [x] Camera access via MediaDevices API (WebRTC)
- [x] Selfie capture with canvas preview + retake
- [x] Consent checkbox (BIPA/GDPR) — blocks match without it
- [x] Selfie → `POST /match` → gallery display
- [x] Match percentage, processing time, photo count

### Frontend API Client
- [x] `src/lib/api.ts` — typed functions for all endpoints
- [x] `NEXT_PUBLIC_API_URL` env var with localhost fallback

### Routing
- [x] `/` — landing page (cinematic dark theme)
- [x] `/organizer` — organizer dashboard
- [x] `/attendee` — attendee portal
- [ ] QR code generation + scanning endpoint
- [ ] Catch-all error boundary pages

## ML Processing (ml/)

- [x] Modal stub definition (grabpic-processor)
- [x] MTCNN face detection (GPU)
- [x] FaceNet/ArcFace 512-dim embedding generation
- [x] DBSCAN clustering (eps=0.4, min_samples=2)
- [x] Turso storage (faces + embeddings)
- [x] Event status update after processing
- [x] requirements.txt with pinned versions
- [ ] Deploy Modal function to production
- [ ] Test with real event photos

## Infrastructure Provisioning

### Turso Database
- [ ] Create Turso DB (`turso db create grabpic-dev`)
- [ ] Run migration (schema create tables)
- [ ] Store TURSO_URL + TURSO_TOKEN in .env
- [ ] Configure Turso credentials as Modal secret

### Cloudflare R2
- [ ] Create R2 bucket (`wrangler r2 bucket create grabpic-photos`)
- [ ] Generate R2 API access keys
- [ ] Configure CORS for direct uploads
- [ ] Store R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY in .env

### Cloudflare Workers
- [ ] Deploy API (`wrangler deploy`)
- [ ] Configure wrangler.toml vars (MODAL_TOKEN, MODAL_WEBHOOK_URL)
- [ ] Set up custom domain (api.grabpic.app)
- [ ] Configure 30-day expiry cron job

### Modal.com
- [ ] Create Modal account
- [ ] Set up Modal CLI + token
- [ ] Create turso-credentials secret in Modal
- [ ] Deploy grabpic-processor function

### Vercel
- [ ] Deploy frontend
- [ ] Configure environment variables (NEXT_PUBLIC_API_URL)
- [ ] Set up custom domain (grabpic.app)
- [ ] Configure Sentry + PostHog

## Testing

- [x] vitest config (30s timeout, globals, verbose reporter)
- [x] 00-north-star.test.ts — end-to-end match flow
- [x] 01-processing-time.test.ts — upload + confirm + poll timing
- [x] 02-api-latency.test.ts — p95 latency per endpoint
- [x] 03-event-throughput.test.ts — bulk event creation
- [x] 04-photo-throughput.test.ts — signed URL upload flow
- [x] 05-secondary-metrics.test.ts — analytics tracking
- [x] 06-contracts.test.ts — type shape validation
- [x] helpers/setup.ts — real infra env loading + clients
- [x] helpers/benchmark.ts — latency measurement utilities
- [ ] Run full test suite against production infra
- [ ] Add CI pipeline (GitHub Actions)

## Monitoring & Analytics

- [ ] Set up Sentry DSN in .env + wrangler.toml
- [ ] Set up PostHog in .env + frontend
- [ ] Add structured logging to Worker routes
- [ ] Add match_sessions tracking to match endpoint
- [ ] Create status page (status.grabpic.app)

## Security & Privacy

- [x] Consent gate before selfie capture (checkbox, blocks match)
- [x] Embedding isolation per event (no cross-event sharing)
- [x] Right to deletion cascade (DELETE /events/:id)
- [ ] 30-day auto-expiry cron job (scheduled Worker)
- [ ] JWT-based organizer auth (future)
- [ ] Rate limiting on match endpoint

## Documentation

- [x] AGENTS.md with architecture decisions and rules
- [x] 8 engineering docs in docs/modularized_prd/
- [x] .env.example with all required vars
- [x] README with architecture, setup, testing, docs links
- [x] Resolved open_questions.md
- [x] Full project todo.md
- [ ] Add deployment guide
- [ ] Add API usage examples

## Deployment Pipeline

- [ ] GitHub Actions CI (lint + test + typecheck)
- [ ] Wrangler deploy on push to main
- [ ] Vercel auto-deploy from GitHub
- [ ] Modal deploy script
- [ ] Smoke test after deployment
