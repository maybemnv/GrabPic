---
title: GrabPic Infrastructure and Deployment Handoff
project: maybemnv/GrabPic
repository: https://github.com/maybemnv/GrabPic
document_type: agent-context-and-deployment-contract
last_reviewed: 2026-10-16
status: pre-production; Worker preview and Convex health verified; OCI and real-stack staging pending
---

# GrabPic: Architecture, Infrastructure, and Deployment Contract

> **For engineering agents:** Read this document before changing infrastructure, deployment configuration, or runtime behavior. Treat the current repository code and `docs/deployment.md` as authoritative for exact implementation details. This handoff explains the selected architecture, environment boundaries, verification requirements, known machine constraints, and the next deployment tasks. Do not treat a passing CI run as proof that production infrastructure is working.

## 1. Product definition

GrabPic is an event-photo distribution platform with **consented, event-scoped selfie matching**.

- **Organizer workflow:** Create an event, upload event photos once, wait for processing, then share an invite link, QR code, or six-digit event passcode.
- **Attendee workflow:** Open the event, explicitly consent to selfie processing, take or upload a selfie, and view/download only the event photos matched to that selfie.
- **Machine-learning workflow:** Detect faces in uploaded photographs, compute 512-dimensional normalized facial embeddings using the pinned FaceNet VGGFace2 model, optionally cluster faces with DBSCAN, and match attendee embeddings against an event-filtered Convex vector index.
- **Product latency goal:** Selfie submission to gallery results **p95 < 5 seconds**, for warm and first-request-after-restart cases. This is a target, **not a measured result**.
- **Privacy constraints:** Event isolation, consent gating, signed photo URLs, deletion/expiry, and carefully scoped secret ownership. Public launch also requires policy/legal review and stronger organizer account/recovery workflows.

## 2. Architecture decisions: do not redesign without approval

The selected production architecture is **Cloudflare Pages + Workers/Hono + R2 + Queues + Convex + Oracle Cloud Infrastructure (OCI) CPU processor**.

```text
Attendee/Organizer Browser
          |
          v
Cloudflare Pages (static Next.js frontend)
  - /, /organizer, /attendee, /status
  - Pages Function for /e/:inviteCode redirect
          |
          v
Cloudflare Worker (Hono, public application API)
  |             |                  |
  |             |                  +--> Cloudflare R2 (originals/thumbnails)
  |             +--> Convex (events, jobs, metadata, facial embeddings,
  |                            event-filtered vector search)
  |
  +--> Cloudflare Queue: grabpic-processing
              |
              v
       Worker Queue consumer
              | authenticated /process
              v
       OCI VPS: HTTPS Nginx -> FastAPI/Uvicorn
          | - MTCNN + FaceNet + DBSCAN
          | - persistent SQLite job state
          | - read originals and write thumbnails in R2
          |
          +-- authenticated /internal/processor/results callback --> Worker --> Convex

For attendee matching, Worker calls OCI HTTPS /embed directly (not via Queue),
then asks Convex for event-filtered similarity search and signs R2 photo URLs.
```

**Critical boundaries:**

1. **Only Cloudflare Worker is the public application API.** OCI exposes a separately reachable, authenticated internal processor API over HTTPS. Do not move Hono, frontend, or application database onto OCI.
2. **Frontend has no direct Convex or OCI credentials.** It talks to the Worker. Browser uploads/downloads use Worker-generated, time-limited signed R2 URLs.
3. **OCI never receives `CONVEX_URL` or `CONVEX_SERVICE_SECRET`.** It reports results to the Worker through an authenticated callback.
4. **Convex is the one authoritative application database.** Do not restore Turso, enable dual writes, add Postgres, or add Redis without an approved architecture change.
5. **Queue dispatch is per event**, not per photo. The processor handles photos sequentially, and Convex marks the event ready only after the final processing callback.
6. **The model must match across both paths:** batch-photo processing and attendee selfie embedding must use the same pinned FaceNet weights.

## 3. Where every service is deployed

| Component | Technology | Hosting/provider | Responsibility |
| --- | --- | --- | --- |
| Landing page and organizer/attendee UI | Next.js 14, React, TypeScript, Tailwind | **Cloudflare Pages** | Static frontend export |
| Invite redirects | Cloudflare Pages Function | **Cloudflare Pages** | `/e/:code` redirect |
| Public application API | Hono / TypeScript | **Cloudflare Workers** | Access control, API routes, upload/matching orchestration |
| Application records and jobs | Convex schema/functions | **Convex Cloud** | Events, photos, faces, match sessions, processing jobs |
| Face-vector search | 512-d event-filtered Convex vector index | **Convex Cloud** | Candidate retrieval and event isolation |
| Original images and thumbnails | Object storage, S3-compatible API | **Cloudflare R2** | Originals, 200px and 800px thumbnails |
| Processing dispatch | `grabpic-processing` | **Cloudflare Queues** | Asynchronous event jobs |
| Failed-job handling | `grabpic-processing-dead` + Worker consumer | **Cloudflare Queues/Workers** | Surface abandoned processing jobs as failed/retryable |
| CPU face detection/embedding | Python, PyTorch, facenet-pytorch MTCNN and FaceNet | **OCI Ubuntu VPS** | Detect faces and embed selfies/photos |
| Face clustering | scikit-learn DBSCAN | **OCI Ubuntu VPS** | Cluster detected faces |
| Processor HTTP API | FastAPI + single-process Uvicorn | **OCI Ubuntu VPS** | `/process`, `/cancel`, `/embed`, `/health` |
| Processor durable job acceptance | SQLite on persistent disk | **OCI Ubuntu VPS** | Job persistence, restart/retry/cancel state |
| Processor process supervision | systemd | **OCI Ubuntu VPS** | One active process, restart behavior, memory policy |
| Processor HTTPS and ingress | Nginx + Certbot | **OCI Ubuntu VPS** | HTTPS reverse proxy to `127.0.0.1:8000` |
| Expiry / deletion scheduling | Worker cron | **Cloudflare Workers** | Scheduled 30-day event cleanup |
| Observability | Sentry, PostHog, Worker structured logs | **Cloudflare/frontend external services** | Error reporting, analytics, operational monitoring |
| CI | GitHub Actions | **GitHub** | Build, types, contracts, processor tests; not production deployment |

**Not in the current production architecture:** Vercel, Modal GPU, Turso/libSQL, AWS S3 as the primary bucket, Postgres, Redis, Kubernetes, or mandatory Docker Compose. These may appear in **historical documents**, not the current deployment contract.

## 4. Runtime and code locations

```text
apps/web/                        # Next.js frontend
apps/web/next.config.js          # output: 'export'; build needs NEXT_PUBLIC_API_URL
apps/api/                        # Cloudflare Worker, routes, Convex functions
apps/api/src/index.ts            # HTTP, Queue consumer, cron
apps/api/src/routes/match.ts     # /events/:id/match -> OCI /embed -> Convex -> R2 links
apps/api/src/routes/upload.ts    # signed R2 upload URLs + confirmation
apps/api/src/routes/processor-callback.ts
apps/api/convex/                 # Convex schema, queries, mutations, actions
apps/api/wrangler.toml           # R2, Queues, rate limit, cron bindings
functions/e/[code].ts            # Cloudflare Pages invite redirect
ml/processor.py                  # MTCNN, FaceNet, DBSCAN, R2, callbacks
ml/server.py                     # FastAPI, persistent acceptance/cancel/embed
ml/requirements.txt             # pinned Python dependencies
ml/Dockerfile                    # optional container alternative
deploy/oci/grabpic-processor.service # selected native systemd service
deploy/oci/nginx.conf            # sample TLS reverse proxy
docs/deployment.md               # CURRENT ordered go-live runbook
docs/convex-production-env.md    # environment ownership and setup
docs/progress.md                 # project progress / outstanding validation
docs/convex-evaluation.md       # benchmark/evaluation doc; contains legacy content
.github/workflows/ci.yml        # CI definition
```

### OCI native service configuration

- Python: **3.11** virtual environment under `/opt/grabpic/.venv`; Ubuntu 24.04's default `python3` is not automatically Python 3.11.
- Service user: `grabpic`.
- Processor working directory: `/opt/grabpic/ml`.
- Persistent SQLite file: `/var/lib/grabpic/jobs.sqlite3`.
- Runtime environment file: `/etc/grabpic/processor.env`, restricted permissions.
- Model cache: `/opt/grabpic/models`.
- Uvicorn: **one worker**, binding `127.0.0.1:8000`.
- Nginx listens for public HTTPS and reverse-proxies to localhost:8000.
- systemd template sets `MemoryMax=850M`; validate against actual memory use and adjust only with measured justification / VM choice.
- Docker image exists but is **an optional alternative**; do not deploy both systemd-native and containerized processor simultaneously.

Pinned Python dependencies currently include `torch==2.2.2`, `torchvision==0.17.2`, `facenet-pytorch==2.6.0`, `fastapi==0.115.12`, `uvicorn==0.34.2`, `numpy==1.26.4`, `scikit-learn==1.5.2`, and `pillow==10.2.0`.

## 5. Request flows and invariants

### A. Organizer creates/uploads an event

1. Browser -> Worker creates event; Worker -> Convex persists metadata and one-time organizer management authorization.
2. Browser -> Worker requests signed R2 PUT URLs for approved photos.
3. Browser uploads originals **directly to R2**; bucket CORS must permit the actual Pages origin.
4. Browser confirms upload with Worker; Worker atomically tracks processing state in Convex and sends compact per-event reference to `grabpic-processing` Queue.
5. Queue consumer queries current Convex dispatch state and calls authenticated OCI `/process` with the event's photo references.
6. OCI durably records the job in SQLite, reads originals from R2, creates thumbnails and embeddings, and posts authenticated result batches (up to 25 faces each) to Worker `/internal/processor/results`.
7. Worker validates callback/job/attempt/event identity and persists through Convex. Only final callback with complete accounting moves an event to ready.
8. Failed, stale, duplicated, deleted, or corrupted-photo states must be handled as implemented; a single undecodable photo is skipped without failing all valid photos.

### B. Attendee matches a selfie

1. Browser displays consent and submits selfie to Worker `POST /events/:eventId/match` with event passcode or invite token.
2. Worker authorizes event access via Convex and rate-limits requests.
3. Worker calls authenticated OCI `/embed` **synchronously** to obtain the pinned 512-d embedding.
4. Worker calls Convex event-scoped vector similarity search; threshold is server-owned, currently `MATCH_THRESHOLD=0.6`.
5. Worker signs 5-minute R2 GET URLs and returns matching photo details to the browser.
6. Attendee receives a personalized gallery. No facial embeddings or sensitive service credentials should be logged or exposed to the browser.

### C. Deletion / expiration

- Scheduled Worker runs event expiry and retryable cleanup.
- In-flight OCI jobs are cancelled/tombstoned before R2 cleanup; then Convex rows are purged.
- Stale callbacks after deletion are rejected.
- Verify both explicit deletion and 30-day expiry against **deployed services**, including retries and partial failures.

## 6. Environment and secret ownership

Never log, print, commit, paste into tickets, or expose secret **values**. Store them in the provider's environment/secret system or restricted VM file. Only variable **names** belong in this document.

| Variable | Cloudflare Pages | Cloudflare Worker | Convex | OCI processor |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | **Yes** (public Worker URL) | No | No | No |
| `NEXT_PUBLIC_POSTHOG_API_KEY` | Optional | No | No | No |
| `CONVEX_URL` | No | **Yes** | N/A | **Never** |
| `CONVEX_SERVICE_SECRET` | **Never** | **Yes** (secret) | **Yes** (same secret) | **Never** |
| `CONVEX_DEPLOY_KEY` | No | No | Deployment CLI/CI only, if needed | No |
| `R2_BUCKET` | No | Bound/config | No | **Yes** |
| `R2_ENDPOINT` | No | **Yes** | No | **Yes** |
| `R2_ACCESS_KEY_ID` | No | **Yes** (secret) | No | **Yes** (secret) |
| `R2_SECRET_ACCESS_KEY` | No | **Yes** (secret) | No | **Yes** (secret) |
| `PROCESSOR_TOKEN` | No | **Yes** (secret) | No | **Yes** (same secret) |
| `PROCESSOR_CALLBACK_TOKEN` | No | **Yes** (secret) | No | **Yes** (same secret) |
| `PROCESSOR_WEBHOOK_URL` | No | **Yes** (OCI `/process`) | No | No |
| `PROCESSOR_CANCEL_URL` | No | **Yes** (OCI `/cancel`) | No | No |
| `PROCESSOR_EMBEDDING_URL` | No | **Yes** (OCI `/embed`) | No | No |
| `WORKER_CALLBACK_URL` | No | No | No | **Yes** (Worker callback route) |
| `PROCESSOR_DB_PATH` | No | No | No | **Yes** |
| `MATCH_THRESHOLD` | No | **Yes** (`0.6` configured) | No | No |
| `CORS_ORIGINS` | No | **If needed** (exact Pages origins) | No | No |
| `SENTRY_DSN` | No | Optional secret | No | No |

**R2 S3 endpoint:** use `https://<account_id>.r2.cloudflarestorage.com`, without `/grabpic-photos` appended. The bucket is separately `grabpic-photos`. The endpoint is not an authentication credential; signed requests also need Access Key ID and Secret Access Key.

**Domain convention:** `grabpic.app`, `api.grabpic.app`, and `processor.grabpic.app` are examples, **not confirmed registered domains**. Pages can use `*.pages.dev` and Worker can use `*.workers.dev` for staging. OCI still needs a reliable HTTPS endpoint with a properly trusted TLS certificate. Decide how to provide that **before configuring processor URLs**, and ensure both R2 CORS and Worker `CORS_ORIGINS` include the exact frontend origin.

**Certificate bootstrapping note:** `deploy/oci/nginx.conf` is a 443-only example referring to existing certificate files. Do not install it verbatim before certificates exist. Provide a reachable ACME challenge path or another verified issuance process, then enable the HTTPS vhost.

## 7. OCI machine observed during interactive setup

The user connected to an already-running OCI VM over SSH and reported the following output from `fastfetch`:

| Property | Observed |
| --- | --- |
| OS | Ubuntu 24.04.5 LTS (Noble) |
| Architecture | **x86_64** |
| CPU | AMD EPYC; **2 visible vCPUs**, on a burstable micro shape (not two dedicated physical cores) |
| RAM | ~**954 MiB**, ~421 MiB used at idle |
| Swap | **Disabled** at observation time |
| Root disk | ~**44 GiB** total, ~2.83 GiB used |
| GPU | None; CPU-only inference |
| SSH | **Working**; private key remains on user's Windows PC |

**This is likely OCI `VM.Standard.E2.1.Micro`, but verify the exact shape in OCI Console.** CPU inference on this machine is a substantial performance/memory risk. A 1 GiB swap file may reduce abrupt OOM failures but will not provide GPU capabilities or fix slow CPU inference.

**Do not automatically install heavy PyTorch dependencies or build Docker images on this micro VM.** Check available memory and runtime compatibility, then decide whether to build the Python environment elsewhere, run a small controlled benchmark, or obtain a larger instance. An OCI A1 Flex instance provides more memory but is ARM64 and requires validating the pinned torch/torchvision wheels and model dependencies first. Do not assume x86 binaries run on ARM.

## 8. Deployment sequence and verification gates

Follow `docs/deployment.md` for actual commands and service-specific setup. Use this sequence and do **not** claim a stage complete without evidence.

### Phase 0: Inventory and approvals

- [ ] Verify which Cloudflare account/project, Convex deployment, OCI instance, DNS names, and Git commit are intended for **staging**.
- [ ] Confirm exact OCI instance shape, available RAM, disk, architecture, and Python strategy.
- [x] Verify R2 bucket `grabpic-photos` and both Cloudflare queues exist.
- [ ] Establish secret ownership with unique, random `CONVEX_SERVICE_SECRET`, `PROCESSOR_TOKEN`, and `PROCESSOR_CALLBACK_TOKEN`.
- [ ] Never create paid resources, change billing, delete existing resources, weaken firewall rules, or rotate live credentials without explicit approval.

### Phase 1: Convex

- [x] Deploy schema and functions from `apps/api/convex` to production `rare-mole-267`.
- [x] Set matching `CONVEX_SERVICE_SECRET` in Convex and the deployed Worker version; authenticated health passes.
- [x] Verify deployed 512-dimensional event-filtered vector index and system health query.
- [x] Record `CONVEX_URL=https://rare-mole-267.convex.cloud` in the ignored root `.env` and Worker secret binding.

### Phase 2: Cloudflare R2 and Queues

- [x] Verify private R2 bucket `grabpic-photos`; replacement credentials passed a write/read/delete round trip in this session.
- [x] Configure R2 PUT CORS for planned `https://grabpic.pages.dev` and local development origins; browser upload from a deployed frontend remains untested.
- [x] Create `grabpic-processing-dead` and `grabpic-processing`; both consumers exist and delivery is paused.
- [x] Verify Worker R2 binding, Queue producer, and rate limiter on the deployed version.
- [ ] Enable and verify queue delivery and the expiry cron after OCI setup and release gates; neither is active now.

### Phase 3: OCI processor

- [ ] Restrict SSH ingress to user's IP in OCI NSG/security rules; allow HTTPS 443, and 80 as needed for certificate issuance. Never expose 8000 publicly.
- [ ] Install prerequisites and **Python 3.11** after checking memory/compatibility; install exact pinned requirements or deploy a separately built and verified CPU image.
- [ ] Provision persistent SQLite job path and restricted `/etc/grabpic/processor.env`.
- [ ] Set R2 credentials, processor tokens, Worker callback URL; **never** Convex credentials.
- [ ] Configure systemd single Uvicorn process on `127.0.0.1:8000`.
- [ ] Configure Nginx and trusted HTTPS certificate; test renewal.
- [ ] Verify local `/health` and remote HTTPS `/health`; unauthenticated `/embed` should reject requests.
- [ ] Measure memory and latency before relying on the micro instance.

### Phase 4: Cloudflare Worker

- [x] Configure Convex/R2 secret bindings and both processor tokens on version `a4c0d732-b7cd-4d00-b04e-63534cb8a2ae`.
- [ ] Configure the three HTTPS processor URLs after the user completes OCI setup.
- [x] Deploy Hono Worker for preview access; verify HTTP 200 from `/health` and `/health/processing` with `database: connected` (section 9).
- [ ] Complete production routing, queue delivery, and cron activation after the remaining gates. The primary `workers.dev` route is disabled.

### Phase 5: Cloudflare Pages

- [x] Build static Next.js export locally into `apps/web/out`; Pages Functions compilation also passed in this session.
- [ ] Set build-time `NEXT_PUBLIC_API_URL` to the **actual** deployed Worker address.
- [ ] Deploy Pages Functions for invite redirects.
- [ ] Configure Pages origin in **both** R2 CORS and Worker `CORS_ORIGINS` as necessary.
- [ ] Test browser upload preflight and signed PUT from deployed Pages, not just curl.

### Phase 6: Real-stack staging and sign-off

Use disposable, consented photo fixtures. At minimum:

- [ ] Create event -> obtain signed R2 PUT URLs -> upload photos -> confirm -> Queue dispatch -> OCI processing -> authenticated callbacks -> ready state.
- [ ] Verify attendee consent -> selfie -> OCI `/embed` -> Convex event-filtered matching -> signed gallery.
- [ ] Verify thumbnail access, no cross-event results, duplicate delivery, bad callback authorization, stale attempts, skipped corrupted photos, and cancellation/retry behavior.
- [ ] Verify deletion and 30-day expiry fully remove relevant R2, Convex, and local job data.
- [ ] Measure **100-photo batch peak processor RSS < 850 MB** on the currently selected configuration; no OOM kills or unbounded swap growth.
- [ ] Measure **p95 selfie-to-gallery < 5 seconds** warm and after processor restart; run at least 20 timed selfie requests, including while a batch is processing.
- [ ] Assess model accuracy and the known **256-candidate vector search ceiling** with representative event sizes.
- [ ] Record actual measurements and deployment SHA in `docs/convex-evaluation.md`.
- [ ] Check real Sentry alert delivery and queue health; verify rollback and privacy/terms requirements before external users.

**Release rule:** If hardware memory/latency, match quality, isolation, cleanup, or reliability checks fail, **do not route production traffic**. Fix or resize the runtime and repeat the staging gate.

## 9. Current known status (as of 2026-10-16)

### Verified deployment evidence

Snapshot checked on **2026-10-16 IST / 2026-10-15 UTC** against source commit
`5895969a7b27e9622a4fe433095afaaee5add0e6`. Documentation edits after this
snapshot do not represent a new application deployment.

| Component | Verified state |
| --- | --- |
| Convex | User selected production `https://rare-mole-267.convex.cloud`; schema/functions and event-filtered 512-dimensional `faces.by_embedding` index deployed. Direct authenticated `system.health` returns `{"status":"ok"}`. |
| Worker | `grabpic-api`, version `a4c0d732-b7cd-4d00-b04e-63534cb8a2ae`, deployment `16cb67da-9009-421e-99e0-449b04e1f1da`. Preview routing enabled; primary `workers.dev` route disabled; no custom Worker domains attached. |
| HTTP health | `https://staging-grabpic-api.manavkauahal99.workers.dev/health` returns HTTP 200 `{"status":"ok"}`. `/health/processing` returns HTTP 200 `{"status":"ok","database":"connected"}`. Rechecked at `2026-10-15T21:12Z`. |
| R2 | Private `grabpic-photos` bucket bound as `PHOTOS`. Replacement credentials passed write/read/delete and cleanup verification in this session. CORS allows PUT from `https://grabpic.pages.dev`, `http://localhost:3000`, and `http://127.0.0.1:3000`, with Content-Type/Content-Length, exposed ETag, and 3600-second max age. |
| Queues | `grabpic-processing` and `grabpic-processing-dead` exist with Worker consumers. **Both have delivery paused** and **86400-second (24-hour) retention**. Extending retention to four days failed; reconcile this with the retry-window assumption in `wrangler.toml` before go-live. |
| Cron | No live schedules. Repository configuration contains `0 3 * * *`, but automatic expiry is **not active** on this preview deployment. |
| Pages | Project `grabpic`, `grabpic.pages.dev`, production branch `master`; **no site deployment**. Worker CORS is configured for this planned origin. |

The health handler in `apps/api/src/index.ts` checks authenticated Convex
connectivity only. It does not call OCI, run inference, check R2, or exercise
Queue delivery. The R2 round trip is separate evidence. Earlier preview URLs
returned Cloudflare 404; the successful HTTP checks above were obtained after
initializing the Worker deployment and reapplying preview routing while keeping
the primary route disabled.

### Environment and local tooling changes

- Ignored root `.env` now contains the selected Convex URL/deploy key, matching service secret, R2 bucket/credentials, and both processor tokens. No secret values belong in Git or this handoff.
- The deployed Worker has six secret bindings: `CONVEX_URL`, `CONVEX_SERVICE_SECRET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `PROCESSOR_TOKEN`, and `PROCESSOR_CALLBACK_TOKEN`.
- `.env` still has `NEXT_PUBLIC_API_URL=http://localhost:8787`. Its `WORKER_CALLBACK_URL` points to the disabled primary Worker route; replace it with the agreed reachable callback address during OCI setup. The three `PROCESSOR_*_URL` values are empty and absent from the deployed Worker.
- Cloudflare CLI authentication uses Wrangler OAuth. The local missing `undici/lib/api` installation was repaired with `pnpm install --force --frozen-lockfile`; Wrangler secret-command startup, Worker dry-run, frontend static build, and Pages Functions compilation passed without dependency/lockfile changes.
- An initial Convex secret mismatch was resolved using an exact UTF-8 secret file without a trailing newline. Use the file-based procedure in [convex-production-env.md](convex-production-env.md#4-deploy-convex); do not rely on the earlier PowerShell clipboard pipeline.

### Explicitly unfinished

OCI configuration was left to the user as requested. The earlier SSH/hardware
report in section 7 is user-provided context, not a processor deployment check.
Processor HTTPS endpoints, inference, memory/latency measurements, deployed
upload-to-gallery flow, match quality, deletion/expiry, Pages deployment, and
production activation remain open. `api.grabpic.app` is not an attached Worker
domain and must not be presented as a working health URL. No evidence here
establishes production readiness or the five-second target.

## 10. Engineering-agent operating rules

1. **Inspect before modifying.** Check `master` SHA, read latest README and `docs/deployment.md`, and reconcile this handoff against current code. If the repository has changed, report differences instead of blindly following stale commands.
2. **Report provenance.** Separate `implemented in code`, `CI tested`, `deployed`, `smoke-tested`, `performance-measured`, and `production-ready` in progress reports.
3. **Prefer minimal changes.** Deploy the architecture already implemented; do not add Docker Compose, Redis, Postgres, or move app components to OCI merely to follow a generic VPS tutorial.
4. **Preserve security boundaries.** No public port 8000; no OCI Convex secret; no secrets in git, logs, terminal transcript sharing, or PRs; no service-token leaks to the frontend.
5. **Avoid locking out SSH.** Back up access, verify OCI NSG/security rules, and keep an existing working session while modifying SSH or host firewall policies. Open a second session before applying access restrictions.
6. **Respect the hardware budget.** The observed ~1 GB VM is not a validated inference host. Test compatibility and measure resource usage before asserting support for real traffic.
7. **Make external changes deliberately.** Ask for approval before actions that incur cost, delete data, change public DNS/firewall rules, rotate credentials, or launch public traffic.
8. **Record reproducibility.** Track deployed Git commit, environment, service versions, health results, test evidence, rollback steps, and outstanding blockers.
9. **Call out source-of-truth conflicts.** Older PRDs/docs containing Modal, Turso, Vercel, and unmeasured projections are historical. Current `README.md`, `docs/deployment.md`, deployment files, and live repository code take precedence.
10. **Deliver a clear verdict.** After each deployment phase, report exactly what was changed, what was verified, what failed, and the recommended next action.

## 11. Helpful exact commands (run in the correct environment)

These are reference examples, **not** an instruction to execute them unattended.

### Inspect OCI hardware (inside SSH session)

```bash
cat /etc/os-release
uname -m
nproc
free -h
df -h /
python3 --version
```

### Developer validation (from repository root)

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm build
pnpm vitest run
python -m unittest ml/test_processor.py ml/test_server.py
python -m compileall -q ml
```

### Processor status on OCI (after installation)

```bash
sudo systemctl status grabpic-processor --no-pager
sudo journalctl -u grabpic-processor -n 100 --no-pager
curl -fsS http://127.0.0.1:8000/health
```

### Post-deploy health checks (replace addresses with real deployed domains)

```bash
curl -fsS https://<worker-host>/health
curl -fsS https://<worker-host>/health/processing
curl -fsS https://<processor-host>/health
```

### Example processor-only environment contract (DO NOT paste actual values into chat)

```dotenv
PROCESSOR_TOKEN=<random-shared-worker-to-oci-token>
PROCESSOR_CALLBACK_TOKEN=<random-shared-oci-to-worker-token>
WORKER_CALLBACK_URL=https://<worker-host>/internal/processor/results
PROCESSOR_DB_PATH=/var/lib/grabpic/jobs.sqlite3
R2_BUCKET=grabpic-photos
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<scoped-r2-access-key>
R2_SECRET_ACCESS_KEY=<scoped-r2-secret-key>
```

## 12. Primary sources (check live repository for changes)

- Repo: https://github.com/maybemnv/GrabPic
- README: https://github.com/maybemnv/GrabPic/blob/master/README.md
- Current deployment runbook: https://github.com/maybemnv/GrabPic/blob/master/docs/deployment.md
- Environment ownership: https://github.com/maybemnv/GrabPic/blob/master/docs/convex-production-env.md
- Current progress: https://github.com/maybemnv/GrabPic/blob/master/docs/progress.md
- Worker configuration: https://github.com/maybemnv/GrabPic/blob/master/apps/api/wrangler.toml
- Worker API and Queue/cron handler: https://github.com/maybemnv/GrabPic/blob/master/apps/api/src/index.ts
- OCI service: https://github.com/maybemnv/GrabPic/blob/master/deploy/oci/grabpic-processor.service
- OCI Nginx: https://github.com/maybemnv/GrabPic/blob/master/deploy/oci/nginx.conf
- OCI processor dependencies: https://github.com/maybemnv/GrabPic/blob/master/ml/requirements.txt
- CI: https://github.com/maybemnv/GrabPic/blob/master/.github/workflows/ci.yml
- Historical benchmark document to update: https://github.com/maybemnv/GrabPic/blob/master/docs/convex-evaluation.md

---

## Agent's immediate next action

**Resume from the verified preview in section 9.** Recheck its live health and
deployment IDs before making changes. OCI configuration is explicitly owned by
the user for now; do not install or configure the processor on their behalf.
After they provide verified processor HTTPS endpoints, configure the Worker
endpoints and reachable callback address, deploy Pages with the actual Worker
URL, reconcile queue retention, and complete the measured staging gates. Queue
delivery, cron, and production routing remain disabled until their prerequisites
are satisfied. Do not repeat Convex/R2 provisioning or treat the health result as
an end-to-end processing pass.
