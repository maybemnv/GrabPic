# Deployment: Cloudflare Pages and OCI processor

The public web app is a static Next.js export on Cloudflare Pages. Its `/e/:code`
invite redirect is a Pages Function. The existing Cloudflare Worker/Hono API
remains the only public application API. Convex holds event/job/face data, R2
holds originals and thumbnails, and a Cloudflare Queue transports processing
requests to the CPU processor on OCI. The processor posts authenticated batches
of at most 25 faces to `/internal/processor/results`. It never has Convex
credentials. The frontend never has processor or Convex credentials.

```text
Pages -> Worker/Hono -> Convex and R2
                 | -> Cloudflare Queue -> Nginx -> FastAPI on OCI -> R2
                 | <------- authenticated callback ----------|
           match -> Nginx -> /embed (same pinned model)
```

The VM's Nginx terminates HTTPS for the **processor**, not for Pages. The API
Worker stays on Cloudflare because its R2, rate limiter, Queue, cron, and
Convex integrations already exist there. OCI VM.Standard.E2.1.Micro has 1 GB
RAM and a burstable 1/8 OCPU allocation. Limit the VM to one Uvicorn process,
one inference at a time, and keep SQLite on persistent disk. FaceNet performance
and peak memory on this shape remain an explicit staging gate. A 1 GB swapfile
can prevent abrupt OOM kills, but cannot make the under-five-second target
plausible by itself. Stop cutover if the model cannot stay within memory or the
measured selfie p95 exceeds the product target. No embeddings are required for
local unit, contract, type, or frontend build checks.

## Configuration and deployment order

1. Create the R2 bucket `grabpic-photos`, apply browser CORS for the exact Pages
   origin, and create bucket-scoped S3 credentials for the Worker signer and
   OCI processor. The OCI VM is outside Cloudflare's binding runtime and needs
   these credentials. Create `grabpic-processing` and
   `grabpic-processing-dead` Queues and the Convex deployment. Monitor the dead
   letter queue; after 20 failed deliveries an accepted job needs operator
   investigation and an explicit retry.
2. Deploy Convex schema/functions. Set the same random `CONVEX_SERVICE_SECRET`
   in Convex and the Worker. Provision R2 and the Queue bindings in
   `apps/api/wrangler.toml`. Set `R2_BUCKET` in Wrangler. Set `CONVEX_URL`,
   `R2_ENDPOINT`, `PROCESSOR_WEBHOOK_URL`, `PROCESSOR_CANCEL_URL`, and
   `PROCESSOR_EMBEDDING_URL` as Worker secret bindings (this avoids committing
   placeholder production URLs). Set `CONVEX_SERVICE_SECRET`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `PROCESSOR_TOKEN`, and
   `PROCESSOR_CALLBACK_TOKEN` as Worker secrets, never plaintext `[vars]`.
3. Build the CPU image from `ml/Dockerfile` away from the VM, or install pinned
   `ml/requirements.txt` into `/opt/grabpic/.venv` on an image with sufficient
   build resources. Preload the pinned `vggface2` weights (the Dockerfile does
   this). Mount `/var/lib/grabpic` persistently. Use the sample systemd unit in
   `deploy/oci/grabpic-processor.service` with `/etc/grabpic/processor.env`
   readable only by the `grabpic` account. Set `PROCESSOR_DB_PATH` to
   `/var/lib/grabpic/jobs.sqlite3`, `PROCESSOR_TOKEN`,
   `PROCESSOR_CALLBACK_TOKEN`, `WORKER_CALLBACK_URL` ending in
   `/internal/processor/results`, and the four `R2_*` values. Do not set
   `CONVEX_URL` or its service secret on OCI. Keep Uvicorn at one worker.
4. Terminate HTTPS with `deploy/oci/nginx.conf`. Replace the example host,
   provision a valid certificate, expose 443, and keep port 8000 on loopback.
   Point the Worker processor URLs at this host's `/process`, `/cancel`,
   and `/embed`. Require the bearer token on each endpoint. Configure the
   public `grabpic.app` and preview origins in Worker CORS and R2 CORS before
   browser sign-off. Check `GET /health` and `GET Worker /health/processing`.
5. Deploy Worker with `pnpm --filter @grabpic/api deploy`. Configure Pages with
   repository root as build root, build command
   `pnpm install --frozen-lockfile && pnpm --filter @grabpic/web build`, and
   output directory `apps/web/out`. Set `NEXT_PUBLIC_API_URL` to the Worker
   origin at **build time**. The Pages project root is the repository root so
   that `functions/e/[code].ts` is detected. Verify `/e/<invite-token>` returns 302.

## Queue and deletion contract

Upload confirmation first records the Convex job, enqueues one **event** message
with its event/job/attempt IDs, then records acceptance and returns 202. The
consumer reads the photo references from Convex, keeping the Queue message
small even for a 1,000-photo event.
Queue delivery may be duplicated. The consumer checks Convex state and retries
until acceptance is recorded; it acknowledges deleting/stale jobs without
calling OCI. The processor stores the job in SQLite before returning 202,
processes photos sequentially, and treats duplicate requests as idempotent.
Deletion cancels the job (including a job not yet delivered to OCI), removes
R2 objects, and then purges Convex records. A callback after deletion is
rejected. Failed attempts can be retried with the same job ID and next attempt.
The current Convex column `modalJobId` is a retained internal storage field;
it now holds the stable processor job ID and can be migrated separately.

**Queue granularity:** This uses one message per event, not one per photo.
The current Convex job completes only after a final callback covering all
photos; splitting into per-photo messages would require a separate durable
photo-completion barrier and would risk prematurely marking the event ready.
The processor still reads one photo at a time on OCI.

## Local verification, without embeddings

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm build
pnpm vitest run
python -m unittest ml/test_processor.py ml/test_server.py
python -m compileall -q ml
```

Infrastructure suites remain disabled unless `RUN_REAL_INFRA_TESTS=1` is set.
Do not run them without disposable infrastructure and authorization.

## Staging release gate

Use a disposable event: create -> signed upload -> confirm and Queue acceptance
-> processor callback batches -> thumbnails and ready state -> consented selfie
match -> signed gallery -> delete -> expiry cleanup. Test duplicate Queue
messages, deletion before/after dispatch, stale attempts, bad callback auth,
and retryable partial R2 deletion. Record peak RSS, swap use, p50/p95 matching
and selfie-to-gallery latency in `docs/convex-evaluation.md`. Do not route
production traffic until the 1 GB VM passes those measurements.
