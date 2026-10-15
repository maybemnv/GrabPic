---
title: GrabPic Infrastructure and Deployment Handoff
project: maybemnv/GrabPic
repository: https://github.com/maybemnv/GrabPic
document_type: agent-context-and-deployment-contract
last_reviewed: 2026-10-16
status: pre-production; real-stack staging unverified
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
- [ ] Verify R2 bucket exists and the two Cloudflare queues can be provisioned.
- [ ] Establish secret ownership with unique, random `CONVEX_SERVICE_SECRET`, `PROCESSOR_TOKEN`, and `PROCESSOR_CALLBACK_TOKEN`.
- [ ] Never create paid resources, change billing, delete existing resources, weaken firewall rules, or rotate live credentials without explicit approval.

### Phase 1: Convex

- [ ] Deploy schema and functions from `apps/api/convex` to the intended environment.
- [ ] Set `CONVEX_SERVICE_SECRET` in Convex and the Worker to the **same value**.
- [ ] Verify deployed 512-dimensional vector index and a working system health query.
- [ ] Record the actual `CONVEX_URL` without confusing it with the deploy key.

### Phase 2: Cloudflare R2 and Queues

- [ ] Provision/verify the private R2 bucket `grabpic-photos` and bucket-scoped S3 credentials.
- [ ] Set R2 browser upload CORS for the exact deployed Pages origin.
- [ ] Create dead-letter queue `grabpic-processing-dead` **before** `grabpic-processing`.
- [ ] Verify Worker R2 binding, Queue producer/consumers, rate limiter, and scheduled cron configuration.

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

- [ ] Configure `CONVEX_URL`, `CONVEX_SERVICE_SECRET`, R2 credentials, and the three HTTPS processor URLs and tokens.
- [ ] Deploy Hono Worker; verify `/health` returns `ok` and `/health/processing` reports `database: connected`.
- [ ] Verify Queue consumer, dead-letter consumer, R2 binding, rate limiting, and cron are active.

### Phase 5: Cloudflare Pages

- [ ] Build static Next.js export from repository root into `apps/web/out`.
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

### Confirmed from repository

- Phase 1 application implementation and deployment/readiness fixes are merged.
- CI passed on `master` commit `2345e7f` on **2026-10-14**; it covers deterministic builds/contracts, Worker dry run, Pages Functions compilation, and processor tests **without actual model inference**.
- `docs/progress.md` still marks production Convex configuration, R2, Worker/Queues, OCI processor deployment, Pages deployment, and deployed E2E testing as **unverified**.
- No evidence in the reviewed repository establishes real photo matching quality or <5s p95 on OCI.

### Confirmed from interactive user conversation

- User has a running **Ubuntu 24.04 x86_64 OCI micro VPS** and has successfully connected to it over SSH.
- User has been working on Cloudflare R2 and Convex credentials, but resource creation, environment binding, and deployed health checks have **not** been independently verified here.
- User had not yet confirmed installing the GrabPic processor on the VPS.

**Do not conflate:** account created, credential obtained, service configured, service deployed, health check passed, and production-ready are **distinct states**.

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

**Do not jump straight into deployment.** First inspect the live repository and confirm the OCI VM shape and CPU/memory budget, the actual Cloudflare/Convex resource state, and the agreed processor HTTPS hostname. Then propose the smallest safe sequence that takes GrabPic from SSH-accessible OCI VM to a **measured, consented real-stack staging smoke test**. Obtain approval for infrastructure changes and execute each phase with explicit evidence.
