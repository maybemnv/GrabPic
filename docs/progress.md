### GrabPic

Last updated: 2026-10-16

**Status:** Phase 1 implementation and production-readiness fixes are merged.
Deployment and measured staging acceptance remain open; production readiness
has not been established.

- [ ] Validate market first
- [ ] Talk to organizers
- [ ] Talk to photographers
- [ ] Talk to attendees

**Product**

- [x] MVP architecture
- [x] Monorepo setup (pnpm, Turborepo, shared packages)
- [x] Landing page (cinematic dark theme)
- [x] Organizer dashboard (create event, upload, poll status)
- [x] Attendee portal (code entry, selfie capture, gallery)
- [x] Edge API (Cloudflare Workers + Hono, all routes)
- [x] ML pipeline (OCI CPU service: MTCNN + FaceNet vggface2 + DBSCAN)
- [x] Test suite (Convex contract tests plus opt-in infrastructure suites)
- [x] Monitoring instrumentation (Sentry reporter, PostHog, structured logging; live Sentry delivery unverified)
- [x] Error boundary pages (404, error, global-error)
- [x] QR code generation + redirect
- [x] Documentation (deployment guide, API examples, todo)

**Merged readiness fixes**

- [x] Selfie and batch inference share one model lock, with batch processing yielding to waiting selfies
- [x] Selfie image downscaling, model preload, and bounded selfie request capacity
- [x] Configurable browser CORS origins
- [x] Skip undecodable photos and stream processor callback batches to reduce memory use
- [x] Dead-letter consumer marks abandoned jobs failed, with retry backoff during database outages
- [x] Keep asynchronous Sentry reports alive through Worker `waitUntil`
- [x] Reject malformed JSON with validation errors
- [x] Require `NEXT_PUBLIC_API_URL` for production frontend builds
- [x] Ordered deployment runbook and explicit CI/staging verification boundaries

These changes are merged through PRs [#8](https://github.com/maybemnv/GrabPic/pull/8),
[#9](https://github.com/maybemnv/GrabPic/pull/9), and
[#11](https://github.com/maybemnv/GrabPic/pull/11).

**Validation**

- [x] [CI passed on `master` commit `2345e7f`](https://github.com/maybemnv/GrabPic/actions/runs/38479115825) on 2026-10-13
- [x] CI covers type checks, frontend build/static export, Vitest contracts, Worker dry-run, Pages Functions compilation, Python processor contracts, and Python compilation
- [ ] Run the six opt-in infrastructure suites against deployed services
- [ ] Verify real inference, matching quality, and the deployed upload-to-gallery flow

CI uses processor contracts without model inference. Infrastructure suites skip
unless `RUN_REAL_INFRA_TESTS=1` and `API_BASE_URL` are set. Green CI does not
establish the five-second target or deployment readiness.

**Infrastructure (deployment not verified)**

- [x] Convex schema and functions
- [ ] Convex production functions and service-secret configuration verified
- [ ] Cloudflare R2 bucket
- [ ] API Worker, processing queue, and `grabpic-processing-dead` queue deployed
- [ ] OCI processor deployed and measured
- [ ] Cloudflare Pages frontend deployed

**Staging and go-live gates**

- [ ] Run the [deployment runbook](deployment.md), including the end-to-end smoke test
- [ ] Record peak processor RSS below 850 MB during a 100-photo batch, stable swap, and no OOM kills on the selected VM
- [ ] Measure warm and first-request selfie-to-gallery p95 below five seconds, including a concurrent batch/selfie run
- [ ] Verify event-isolated matches, complete deletion, and 30-day expiry against deployed services
- [ ] Record measurements in [convex-evaluation.md](convex-evaluation.md); its existing Modal comparison is historical
- [ ] Verify live alert delivery, including the Sentry reporter against a real project
- [ ] Complete privacy policy, terms, private pilot, and rollback checks from the runbook

The current OCI target has 1 GB RAM and one processor process. If the staging
memory or latency gate fails, select a larger VM and repeat the measurements
before routing production traffic.
