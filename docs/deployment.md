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

## Go-live runbook (everything you have to do by hand)

Do the phases in order. Each phase ends with a check; do not start the next
phase until it passes. Commands assume PowerShell or Git Bash from the repo root
unless the step says to run it on the VM. Hostnames below are examples:
`grabpic.app` (web), `api.grabpic.app` (Worker), `processor.grabpic.app` (OCI).
If you use different ones, substitute them everywhere, including the Worker CORS
default in `apps/api/src/index.ts` or the `CORS_ORIGINS` variable in phase 5.

### Phase 0: accounts and decisions

- [ ] Cloudflare account with a payment method on file (R2 requires one) and a
      plan that includes Queues. Confirm in the dashboard before continuing.
- [ ] A domain on Cloudflare DNS. Decide the three hostnames above.
- [ ] Convex account and a **production** deployment.
- [ ] Oracle Cloud account and a VM. `VM.Standard.E2.1.Micro` is the documented
      shape but is likely too small (see phase 8). An Ampere A1 Flex VM
      (for example 2 OCPU / 12 GB) is the safer choice; if you pick it, confirm
      the pinned `torch==2.2.2` installs on aarch64 in phase 3.
- [ ] Generate three secrets now and keep them in a password manager. Each must
      be different and random:

  ```bash
  openssl rand -hex 32   # CONVEX_SERVICE_SECRET
  openssl rand -hex 32   # PROCESSOR_TOKEN
  openssl rand -hex 32   # PROCESSOR_CALLBACK_TOKEN
  ```

  `CONVEX_SERVICE_SECRET` goes to Convex and the Worker. `PROCESSOR_TOKEN` and
  `PROCESSOR_CALLBACK_TOKEN` go to the Worker and the OCI VM. Never commit them.
- [ ] Before real attendees use it: a privacy policy and terms that describe the
      biometric processing, the consent text on the selfie screen, and the
      30-day deletion. Have a lawyer review it for BIPA/GDPR; this repo does not
      replace that.

### Phase 1: Convex

```powershell
cd apps/api
pnpm exec convex login
pnpm convex:codegen
pnpm convex:deploy            # choose or create the production deployment
Get-Clipboard | pnpm exec convex env set --prod CONVEX_SERVICE_SECRET
pnpm exec convex env list --prod
```

Copy the secret from the password manager to the clipboard before the
`Get-Clipboard` line. Note the production deployment URL; it becomes the
Worker's `CONVEX_URL`.

Check: the Convex dashboard shows the schema and a vector index on face
embeddings.

### Phase 2: Cloudflare R2 and Queues

```powershell
cd apps/api
pnpm exec wrangler login
pnpm exec wrangler r2 bucket create grabpic-photos
pnpm exec wrangler queues create grabpic-processing-dead
pnpm exec wrangler queues create grabpic-processing
```

Create the dead-letter queue **before** the main queue. Then, in the dashboard
(R2 > Manage R2 API Tokens), create an S3 token scoped to `grabpic-photos` with
read and write. Save the access key ID, the secret and the endpoint
`https://<account_id>.r2.cloudflarestorage.com`.

Apply browser CORS for direct uploads. Save the policy from
`docs/convex-production-env.md` section 3 as `r2-cors.json` in `apps/api`, with
your real web origin in `origins`, then:

```powershell
pnpm exec wrangler r2 bucket cors set grabpic-photos --file r2-cors.json
pnpm exec wrangler r2 bucket cors list grabpic-photos
```

Do not commit `r2-cors.json` if it holds anything environment specific.

Check: `wrangler queues list` shows both queues and `cors list` shows your origin.

### Phase 3: OCI processor

The Worker needs the processor URL and the processor needs the Worker callback
URL, so agree the hostnames in phase 0 and finish DNS before testing.

1. **Network.** Reserve a public IP for the VM. In the OCI subnet security list
   or NSG allow inbound TCP 443 (and 80 for certificate issuance); keep SSH
   restricted to your IP. Ubuntu OCI images also ship host `iptables` rules that
   block 443, so open it there too. Do not expose port 8000.
2. **DNS.** Create an `A` record `processor.grabpic.app` pointing at the VM,
   DNS only (grey cloud), so Nginx's certificate is what clients see.
3. **Swap and user** (on the VM):

   ```bash
   sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
   sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   sudo useradd --system --create-home --home-dir /opt/grabpic grabpic
   sudo mkdir -p /var/lib/grabpic /etc/grabpic /opt/grabpic/models
   sudo chown grabpic:grabpic /var/lib/grabpic /opt/grabpic/models
   ```

4. **Code and Python 3.11 environment.** The provided systemd unit expects
   `/opt/grabpic/.venv`. Use Python 3.11; on Ubuntu 22.04 install it from the
   deadsnakes PPA or with `uv python install 3.11`.

   ```bash
   sudo git clone https://github.com/maybemnv/GrabPic.git /opt/grabpic/src
   sudo ln -s /opt/grabpic/src/ml /opt/grabpic/ml
   sudo python3.11 -m venv /opt/grabpic/.venv
   sudo /opt/grabpic/.venv/bin/pip install --no-cache-dir torch==2.2.2 torchvision==0.17.2 \
     --index-url https://download.pytorch.org/whl/cpu
   sudo /opt/grabpic/.venv/bin/pip install --no-cache-dir -r /opt/grabpic/ml/requirements.txt
   sudo -u grabpic env TORCH_HOME=/opt/grabpic/models /opt/grabpic/.venv/bin/python -c \
     "from facenet_pytorch import InceptionResnetV1; InceptionResnetV1(pretrained='vggface2')"
   ```

   If pip is killed for memory on a 1 GB VM, build the venv on a larger machine
   and copy it. The Dockerfile in `ml/` is the alternative if you would rather
   build an image elsewhere; it needs its own `docker run` instead of the
   systemd unit's `ExecStart`.
5. **Environment file** `/etc/grabpic/processor.env` (mode 600, owner `grabpic`):

   ```text
   PROCESSOR_TOKEN=<from phase 0>
   PROCESSOR_CALLBACK_TOKEN=<from phase 0>
   WORKER_CALLBACK_URL=https://api.grabpic.app/internal/processor/results
   PROCESSOR_DB_PATH=/var/lib/grabpic/jobs.sqlite3
   R2_BUCKET=grabpic-photos
   R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
   R2_ACCESS_KEY_ID=<phase 2>
   R2_SECRET_ACCESS_KEY=<phase 2>
   ```

   Never put `CONVEX_URL` or the Convex secret on the VM.
6. **Service:**

   ```bash
   sudo cp /opt/grabpic/src/deploy/oci/grabpic-processor.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now grabpic-processor
   curl -s http://127.0.0.1:8000/health
   ```

7. **HTTPS.** Install nginx and certbot, copy `deploy/oci/nginx.conf` to
   `/etc/nginx/conf.d/`, replace `processor.example.com` with your host, issue a
   certificate (`sudo certbot certonly --nginx -d processor.grabpic.app`), then
   `sudo nginx -t && sudo systemctl reload nginx`.

Check: `curl https://processor.grabpic.app/health` returns `{"status":"ok"}`, and
`curl -X POST https://processor.grabpic.app/embed` without a token returns 401.

### Phase 4: Worker secrets and deploy

All of these are Worker secret bindings (this keeps placeholder production URLs
out of git). Run each and paste the value when prompted:

```powershell
cd apps/api
foreach ($name in @(
  'CONVEX_URL', 'CONVEX_SERVICE_SECRET',
  'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY',
  'PROCESSOR_TOKEN', 'PROCESSOR_CALLBACK_TOKEN',
  'PROCESSOR_WEBHOOK_URL', 'PROCESSOR_CANCEL_URL', 'PROCESSOR_EMBEDDING_URL'
)) { pnpm exec wrangler secret put $name }
```

The three processor URLs are `https://processor.grabpic.app/process`, `/cancel`
and `/embed`. `R2_BUCKET` and `MATCH_THRESHOLD` are already in `wrangler.toml`.
Then:

```powershell
pnpm deploy
```

Attach `api.grabpic.app` as a custom domain (dashboard: Workers > grabpic-api >
Settings > Domains & Routes), or use the `workers.dev` address for now.

Check: `GET https://api.grabpic.app/health` is `ok`, `GET /health/processing`
reports `database: connected`, and the dashboard shows the R2, Queue (producer
plus both consumers), rate limit and cron bindings.

### Phase 5: web app on Cloudflare Pages

Create a Pages project from the GitHub repo with:

| Setting | Value |
| --- | --- |
| Root directory | repository root (so `functions/e/[code].ts` is deployed) |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter @grabpic/web build` |
| Output directory | `apps/web/out` |
| `NODE_VERSION` | `22` |
| `NEXT_PUBLIC_API_URL` | `https://api.grabpic.app` (build time; the build fails without it) |
| `NEXT_PUBLIC_POSTHOG_API_KEY` | optional |

Add the custom domain `grabpic.app`. If you stay on a `*.pages.dev` address,
add that exact origin to **both** the R2 CORS policy (phase 2) and the Worker:

```powershell
cd apps/api
pnpm exec wrangler secret put CORS_ORIGINS   # e.g. https://grabpic.pages.dev
pnpm deploy
```

Check: `https://grabpic.app` loads, `https://grabpic.app/e/<32 hex chars>`
answers 302 to `/attendee?invite=...`, and the browser Network panel shows no
CORS errors when creating an event.

### Phase 6: end-to-end smoke test on the real stack

Use a disposable event with about 50 fixture photos containing a face you can
take a selfie of.

1. Create an event; save the organizer token (it is shown once).
2. Upload photos; confirm you get 202 and the dashboard moves to ready.
3. Open the attendee page, accept consent, take a selfie, and check the gallery.
4. Delete the event; confirm R2 objects, Convex rows and the processor job are
   gone.
5. Watch for errors: `pnpm exec wrangler tail` for the Worker and
   `journalctl -u grabpic-processor -f` on the VM.

Also try: a selfie match on one event while another event processes (matching
must keep working), a corrupt JPEG in the batch (the event still becomes ready
and that photo is `failed`), and `systemctl stop grabpic-processor` during an
upload (the job fails after the queue retries and the organizer can retry).

### Phase 7: production gate (record in `docs/convex-evaluation.md`)

| Measure | Must be |
| --- | --- |
| Peak processor RSS during a 100-photo batch | below 850 MB (`MemoryMax`) |
| Swap in use during batch plus selfie | not growing; no OOM kills in `journalctl` |
| Selfie to gallery p95 (warm) | under 5 seconds |
| Selfie to gallery p95 (first request after restart) | under 5 seconds |
| Matches | no cross-event results; membership as expected |
| Deletion and 30-day expiry | complete cleanup |

Measure with `ps -o rss= -p <uvicorn pid>`, `free -m` and at least 20 timed
selfie requests. Run a batch and selfies concurrently once.

### Phase 8: decide the VM, then go live

- All rows pass: keep the VM and finish the checklist below.
- Any row fails (memory or p95 is the likely one on 1/8 OCPU): move to a larger
  OCI shape, then repeat phase 3 and phase 7. Nothing in the code needs to
  change; update the `PROCESSOR_*` Worker secrets only if the hostname changes.
  Do not route production traffic until the gate passes.

Go-live checklist:

- [ ] Gate in phase 7 recorded and committed to the evaluation doc.
- [ ] Queue dashboard checked: `grabpic-processing-dead` is empty.
- [ ] Alerting you will actually see: Cloudflare notifications for Worker errors
      and Queue backlog, and a VM uptime check on
      `https://processor.grabpic.app/health`. The Sentry reporter posts straight
      to `SENTRY_DSN` and has not been verified against real Sentry, so do not
      treat it as your only alert.
- [ ] Privacy policy and terms published and linked.
- [ ] Start with a private pilot (one or two real organizers); auth is the
      organizer management token, with no accounts or recovery yet.
- [ ] Rollback known: `pnpm exec wrangler rollback` for the Worker, Pages
      "Rollback to this deployment", `sudo systemctl restart grabpic-processor`
      for the VM.
- [ ] Remove or rotate any Turso or Modal credentials left in dashboards.

## Reference: configuration values

| Value | Where it lives |
| --- | --- |
| `CONVEX_SERVICE_SECRET` | Convex env and Worker secret (same value) |
| `CONVEX_URL`, `R2_ENDPOINT`, `PROCESSOR_WEBHOOK_URL`, `PROCESSOR_CANCEL_URL`, `PROCESSOR_EMBEDDING_URL` | Worker secrets |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Worker secrets and OCI `processor.env` |
| `PROCESSOR_TOKEN`, `PROCESSOR_CALLBACK_TOKEN` | Worker secrets and OCI `processor.env` |
| `WORKER_CALLBACK_URL`, `PROCESSOR_DB_PATH`, `R2_BUCKET` | OCI `processor.env` |
| `CORS_ORIGINS` (optional) | Worker secret; extra exact browser origins |
| `SENTRY_DSN` (optional) | Worker secret |
| `NEXT_PUBLIC_API_URL` | Pages build environment |

Keep Uvicorn at one worker. After 20 failed queue deliveries a message moves to
the dead-letter queue, whose Worker consumer marks the job failed (and attempts
a Sentry report) so the organizer can retry by confirming the upload again.

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

A photo whose original cannot be decoded is skipped rather than failing the
event: the final callback lists it in `skippedPhotoIds` and Convex marks it
`failed`. If no photo can be decoded the job fails.

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
