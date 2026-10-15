### GrabPic

Last updated: 2026-10-16

**Status:** Phase 1 implementation and production-readiness fixes are merged.
Convex and the Worker preview are deployed with verified database health; R2
credential checks passed. OCI, Pages deployment, production activation, and
measured staging acceptance remain open; production readiness is not established.

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

**Infrastructure (verified 2026-10-16 IST / 2026-10-15 UTC)**

- [x] Convex schema and functions
- [x] Convex production `rare-mole-267` deployed; event-filtered 512-d vector index and authenticated health verified
- [x] Private Cloudflare R2 `grabpic-photos` bucket, replacement credentials, write/read/delete round trip, and configured PUT CORS
- [x] API Worker preview deployed with Convex/R2 credentials and processor tokens
- [x] Processing and dead-letter queues created with consumers; both deliveries paused, retention 24 hours
- [x] Preview `/health` and `/health/processing` return HTTP 200; database reports connected
- [ ] Configure OCI processor URLs; intentionally left empty pending user setup
- [ ] Enable production Worker routing, queue delivery, and expiry cron after prerequisites and staging gates
- [ ] OCI processor deployed and measured
- [ ] Cloudflare Pages frontend deployed

Verified health: [Worker preview processing health](https://staging-grabpic-api.manavkauahal99.workers.dev/health/processing)
returned `{"status":"ok","database":"connected"}`. This checks Worker-to-Convex
authentication only. Worker version `a4c0d732-b7cd-4d00-b04e-63534cb8a2ae`
uses source commit `5895969a7b27e9622a4fe433095afaaee5add0e6`; see the
[deployment handoff](GRABPIC_AGENT_DEPLOYMENT.md#9-current-known-status-as-of-2026-10-16)
for deployment ID, environment state, and remaining blockers. The primary
`workers.dev` route is disabled, no custom domain is attached, and no live cron
is scheduled. The Pages project exists but has no deployment. Queue retention
does not yet match the four-day retry-window assumption in the repository.

The ignored root `.env` has the selected Convex/R2 settings and processor tokens;
frontend API configuration remains localhost and processor URLs remain empty.
Wrangler's missing Undici files were repaired with a frozen-lockfile reinstall;
secret-command startup, Worker dry-run, frontend static build, and Pages Functions
compilation passed in this session. No dependency or application source changes
were needed for that repair or the preview deployment.

**Staging and go-live gates**

- [ ] Run the [deployment runbook](deployment.md), including the end-to-end smoke test
- [ ] Record peak processor RSS below 850 MB during a 100-photo batch, stable swap, and no OOM kills on the selected VM
- [ ] Measure warm and first-request selfie-to-gallery p95 below five seconds, including a concurrent batch/selfie run
- [ ] Verify event-isolated matches, complete deletion, and 30-day expiry against deployed services
- [ ] Record measurements in [convex-evaluation.md](convex-evaluation.md); its existing Modal comparison is historical
- [ ] Reconcile the 24-hour queue retention with the dead-letter retry budget before enabling queue delivery
- [ ] Verify live alert delivery, including the Sentry reporter against a real project
- [ ] Complete privacy policy, terms, private pilot, and rollback checks from the runbook

The current OCI target has 1 GB RAM and one processor process. If the staging
memory or latency gate fails, select a larger VM and repeat the measurements
before routing production traffic.
