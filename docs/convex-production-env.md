# Convex production environment setup

This runbook is for preparing a real Convex/Worker/R2/OCI processor environment for
staging and production sign-off. It does not enable dual writes and it does
not give the frontend or OCI processor direct Convex access.

The production path remains:

```text
Next.js -> Cloudflare Worker/Hono -> Convex
                         |          |
                         +-> R2     +-> application state and vector search
                         +-> Queue -> OCI processor -> authenticated Worker callback -> Convex
```

## 1. Preconditions

- Start from the reviewed reviewed deployment commit and record its
  SHA.
- Confirm the P0 organizer authorization boundary and pinned
  `InceptionResnetV1(vggface2)` model/weights are unchanged.
- Use a disposable staging event and fixture photos first. Do not point the
  Worker at production traffic until the full sign-off flow passes.
- Keep all secret values in provider secret stores. Do not commit `.env` files,
  `.dev.vars`, deployment keys, or biometric vectors.

## 2. Values and ownership

| Value | Set in | Purpose |
| --- | --- | --- |
| `CONVEX_URL` | Worker vars | Production Convex deployment URL |
| `CONVEX_SERVICE_SECRET` | Convex env and Worker secret | Worker-only Convex authentication; use the same random value in both places |
| `R2_BUCKET`, `R2_ENDPOINT` | Worker vars and OCI processor environment | R2 bucket and S3-compatible endpoint |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Worker secret and OCI processor environment | Scoped R2 S3 credentials for signing and OCI processing |
| `PROCESSOR_TOKEN` | Worker secret and OCI processor environment | Worker authentication to OCI endpoints |
| `PROCESSOR_CALLBACK_TOKEN` | Worker secret and OCI processor environment | OCI-to-Worker callback authentication |
| `WORKER_CALLBACK_URL` | OCI processor environment | `https://<worker-host>/internal/processor/results` |
| `PROCESSOR_WEBHOOK_URL` | Worker var | HTTPS OCI `/process` endpoint |
| `PROCESSOR_CANCEL_URL` | Worker var | HTTPS OCI `/cancel` endpoint |
| `PROCESSOR_EMBEDDING_URL` | Worker var | HTTPS OCI `/embed` endpoint |
| `MATCH_THRESHOLD` | Worker var | Server-owned matching threshold; keep the approved value |
| `LOG_LEVEL`, `SENTRY_DSN` | Worker vars/secrets | Operational logging and error reporting |
| `NEXT_PUBLIC_API_URL` | Next.js production env | Public Worker URL; never a Convex URL |

OCI processor must not receive `CONVEX_URL` or `CONVEX_SERVICE_SECRET`.

## 3. Provision R2

1. Create or select the production `grabpic-photos` bucket.
2. Verify the Worker `PHOTOS` R2 binding points to that bucket.
3. Create a narrowly scoped R2 API token for the bucket. Use it only for the
   Worker signer and OCI processor object reads/writes.
4. Record the endpoint, bucket name, access key ID, and secret key in the
   secret stores listed above.
5. Verify the event-scoped keys used by the current implementation:
   `events/<event-id>/<photo-id>.jpg` for originals,
   `events/<event-id>/thumbs/200/<photo-id>.jpg` for 200px thumbnails, and
   `events/<event-id>/thumbs/800/<photo-id>.jpg` for 800px thumbnails.

6. Configure R2 CORS for browser-direct signed PUTs. R2 CORS is separate from
   Worker API CORS, so both policies must allow the exact frontend origin used
   by the environment. Save this Wrangler-format policy as `r2-cors.json`:

   ```json
   {
     "rules": [
       {
         "allowed": {
           "origins": ["https://grabpic.app", "http://localhost:3000", "http://127.0.0.1:3000"],
           "methods": ["PUT"],
           "headers": ["Content-Type", "Content-Length"]
         },
         "exposeHeaders": ["ETag"],
         "maxAgeSeconds": 3600
       }
     ]
   }
   ```

   For staging, replace `https://grabpic.app` with the exact deployed staging
   frontend origin before applying the policy. Do not copy production origins
   into staging unless that is intentional. The Worker signs the declared
   `Content-Type` and `Content-Length`, so the browser upload must preserve the
   matching content type.

   From `apps/api`, apply and verify the bucket policy:

   ```powershell
   pnpm exec wrangler r2 bucket cors set grabpic-photos --file r2-cors.json
   pnpm exec wrangler r2 bucket cors list grabpic-photos
   ```

   Before sign-off, run the organizer upload flow from every configured
   frontend origin. The browser Network panel must show a successful `OPTIONS`
   preflight with `Access-Control-Allow-Origin` for that origin,
   `Access-Control-Allow-Methods: PUT`, and `Content-Type` in
   `Access-Control-Allow-Headers`, followed by a successful signed `PUT` and
   upload confirmation. A direct `curl` request without an `Origin` header does
   not verify browser CORS behavior.

Do not expose the bucket URL to clients; gallery and upload URLs must remain
Worker-generated signed URLs.

## 4. Deploy Convex

From `apps/api`:

```powershell
pnpm convex:codegen
pnpm convex:deploy
```

Authenticate the CLI with the production deployment (or provide the CI
`CONVEX_DEPLOY_KEY`). Capture the resulting production `CONVEX_URL`.

Set the Worker-only secret on the production Convex deployment without putting
it in shell history:

```powershell
Get-Clipboard | pnpm exec convex env set --prod CONVEX_SERVICE_SECRET
pnpm exec convex env list --prod
```

The value piped from the clipboard must be a newly generated random secret.
Confirm the deployed schema includes the event-filtered 512-dimensional face
vector index before continuing.

## 5. Configure and deploy the OCI processor

Follow [deployment.md](deployment.md) for the pinned CPU image, persistent SQLite
path, one-process systemd service, and HTTPS Nginx configuration. Configure
`PROCESSOR_TOKEN`, `PROCESSOR_CALLBACK_TOKEN`, `WORKER_CALLBACK_URL`,
`PROCESSOR_DB_PATH`, and scoped R2 credentials in `/etc/grabpic/processor.env`.
Do not give the VM Convex credentials. The Queue consumer expects `/process` to
return the same durable `job_id`; `/cancel` accepts `{ "job_id": "..." }`.

## 6. Configure and deploy the Worker

Set non-secret production values through the Worker deployment configuration
and secrets through Wrangler/provider secret storage. From `apps/api`, provide:

Before deploying, ensure secret names are not also declared in
`apps/api/wrangler.toml` `[vars]`. In particular, `PROCESSOR_TOKEN` and `SENTRY_DSN`
must be secret bindings only; an empty plaintext var can shadow the real secret.

```text
CONVEX_URL=<production Convex URL>
R2_BUCKET=grabpic-photos
R2_ENDPOINT=<production R2 endpoint>
PROCESSOR_WEBHOOK_URL=<HTTPS OCI /process URL>
PROCESSOR_CANCEL_URL=<HTTPS OCI /cancel URL>
PROCESSOR_EMBEDDING_URL=<HTTPS OCI /embed URL>
MATCH_THRESHOLD=0.6
LOG_LEVEL=info
```

Set these as Worker secrets: `CONVEX_SERVICE_SECRET`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `PROCESSOR_TOKEN`,
`PROCESSOR_CALLBACK_TOKEN`, and `SENTRY_DSN` if used.

Deploy only after the values are present:

```powershell
pnpm deploy
```

Verify the `PHOTOS` R2, `PROCESSING_QUEUE`, and `RATE_LIMITER` bindings are attached to the
same production Worker. Check:

```text
GET https://<worker-host>/health
GET https://<worker-host>/health/processing
```

The processing health endpoint must report `database: connected`.

## 7. Configure Next.js

Set only the public Worker URL in the production frontend environment:

```text
NEXT_PUBLIC_API_URL=https://<worker-host>
```

Deploy the static Next.js export to Cloudflare Pages from the repository root, with output directory `apps/web/out` and the root `functions/` directory. Do not add a Convex client or `CONVEX_URL` to the
frontend environment.

## 8. Staging sign-off before production traffic

Run the same disposable fixture through the deployed path:

```text
create event
-> obtain signed upload URLs
-> upload originals to R2
-> confirm upload with organizer authorization
-> receive 202 only after Queue send and Convex acceptance
-> receive authenticated callback batches (maximum 25 faces)
-> verify thumbnails and ready state
-> resolve the attendee event
-> run selfie embedding and event-filtered vector search
-> verify signed gallery assets
-> delete the event and verify Convex/R2/processor cleanup
-> verify expiry uses the same cleanup path
```

Record p50/p95 event, status, match, deletion, and selfie-to-gallery timings
in `docs/convex-evaluation.md`. Acceptance still requires representative
selfie-to-gallery p95 below five seconds, unchanged match membership and
threshold behavior, no cross-event matches, complete retryable deletion, and
no loss caused by the 256-candidate vector-search ceiling.

Also exercise the mandatory races and failures: duplicate confirmations,
duplicate callbacks, wrong-event/stale-job callbacks, callback-after-deletion,
Queue send and OCI acceptance failure, cancellation failure, partial R2 deletion, retries,
and batched purge.

## 9. Cutover and cleanup

1. Save the deployed Convex, OCI processor, Worker, Queue, R2, and frontend versions with the
   measured results.
2. Confirm there is one authoritative application database: Convex.
3. Do not enable a Turso fallback, dual write, or runtime backend selector.
4. Attach the sign-off evidence to the immutable deployed/release SHA and
   deployment record; PR state is not production evidence.
5. After explicit sign-off, revoke any remaining Turso credentials and remove
   them from deployment dashboards and CI secret stores.
6. If any acceptance gate fails, stop the cutover and report the failing
   measurement instead of routing production traffic through a partially
   configured stack.
