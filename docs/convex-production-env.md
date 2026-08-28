# Convex production environment setup

This runbook is for preparing a real Convex/Worker/R2/Modal environment for
staging and production sign-off. It does not enable dual writes and it does
not give the frontend or Modal direct Convex access.

The production path remains:

```text
Next.js -> Cloudflare Worker/Hono -> Convex
                         |          |
                         +-> R2     +-> application state and vector search
                         +-> Modal -> authenticated Worker callback -> Convex
```

## 1. Preconditions

- Start from the reviewed `refactor/convex-data-layer` commit and record its
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
| `R2_BUCKET`, `R2_ENDPOINT` | Worker vars and Modal secret | R2 bucket and S3-compatible endpoint |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Worker secret and Modal secret | Scoped R2 S3 credentials for signing and Modal processing |
| `MODAL_TOKEN` | Worker secret and Modal auth secret | Worker authentication to Modal endpoints |
| `MODAL_CALLBACK_TOKEN` | Worker secret and Modal auth secret | Modal-to-Worker callback authentication |
| `WORKER_CALLBACK_URL` | Modal auth/processing secret | `https://<worker-host>/internal/modal/results` |
| `MODAL_WEBHOOK_URL` | Worker var | Modal `process_event` endpoint |
| `MODAL_CANCEL_URL` | Worker var | Modal `cancel_processing` endpoint |
| `MODAL_EMBEDDING_URL` | Worker var | Modal `embed_selfie` endpoint |
| `MATCH_THRESHOLD` | Worker var | Server-owned matching threshold; keep the approved value |
| `LOG_LEVEL`, `SENTRY_DSN` | Worker vars/secrets | Operational logging and error reporting |
| `NEXT_PUBLIC_API_URL` | Next.js production env | Public Worker URL; never a Convex URL |

Modal must not receive `CONVEX_URL` or `CONVEX_SERVICE_SECRET`.

## 3. Provision R2

1. Create or select the production `grabpic-photos` bucket.
2. Verify the Worker `PHOTOS` R2 binding points to that bucket.
3. Create a narrowly scoped R2 API token for the bucket. Use it only for the
   Worker signer and Modal object reads/writes.
4. Record the endpoint, bucket name, access key ID, and secret key in the
   secret stores listed above.
5. Verify that originals and both thumbnail prefixes are retained:
   `events/<event-id>/...`, `thumbs/200/`, and `thumbs/800/`.

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

## 5. Configure and deploy Modal

Create/update these Modal secrets using the Modal secret manager:

- `grabpic-r2`: `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`
- `grabpic-modal-auth`: `MODAL_TOKEN`, `MODAL_CALLBACK_TOKEN`,
  `WORKER_CALLBACK_URL`

`WORKER_CALLBACK_URL` must end in `/internal/modal/results` on the deployed
Worker. The callback token must exactly match the Worker secret.

Deploy the pinned processor from the repository root:

```powershell
modal deploy ml/processor.py
```

Record the generated endpoint URLs and set them as the Worker values for
`MODAL_WEBHOOK_URL` (`process_event`), `MODAL_CANCEL_URL`
(`cancel_processing`), and `MODAL_EMBEDDING_URL` (`embed_selfie`). Verify that
processing returns an explicit Modal job identifier; an accepted HTTP request
without a job ID is not sufficient.

## 6. Configure and deploy the Worker

Set non-secret production values through the Worker deployment configuration
and secrets through Wrangler/provider secret storage. From `apps/api`, provide:

```text
CONVEX_URL=<production Convex URL>
R2_BUCKET=grabpic-photos
R2_ENDPOINT=<production R2 endpoint>
MODAL_WEBHOOK_URL=<Modal process_event URL>
MODAL_CANCEL_URL=<Modal cancel_processing URL>
MODAL_EMBEDDING_URL=<Modal embed_selfie URL>
MATCH_THRESHOLD=0.6
LOG_LEVEL=info
```

Set these as Worker secrets: `CONVEX_SERVICE_SECRET`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `MODAL_TOKEN`,
`MODAL_CALLBACK_TOKEN`, and `SENTRY_DSN` if used.

Deploy only after the values are present:

```powershell
pnpm deploy
```

Verify the `PHOTOS` R2 binding and `RATE_LIMITER` binding are attached to the
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

Deploy the Next.js app. Do not add a Convex client or `CONVEX_URL` to the
frontend environment.

## 8. Staging sign-off before production traffic

Run the same disposable fixture through the deployed path:

```text
create event
-> obtain signed upload URLs
-> upload originals to R2
-> confirm upload with organizer authorization
-> receive 202 only after Modal returns a real job ID
-> receive authenticated callback batches (maximum 25 faces)
-> verify thumbnails and ready state
-> resolve the attendee event
-> run selfie embedding and event-filtered vector search
-> verify signed gallery assets
-> delete the event and verify Convex/R2/Modal cleanup
-> verify expiry uses the same cleanup path
```

Record p50/p95 event, status, match, deletion, and selfie-to-gallery timings
in `docs/convex-evaluation.md`. Acceptance still requires representative
selfie-to-gallery p95 below five seconds, unchanged match membership and
threshold behavior, no cross-event matches, complete retryable deletion, and
no loss caused by the 256-candidate vector-search ceiling.

Also exercise the mandatory races and failures: duplicate confirmations,
duplicate callbacks, wrong-event/stale-job callbacks, callback-after-deletion,
Modal acceptance failure, cancellation failure, partial R2 deletion, retries,
and batched purge.

## 9. Cutover and cleanup

1. Save the deployed Convex, Modal, Worker, R2, and frontend versions with the
   measured results.
2. Confirm there is one authoritative application database: Convex.
3. Do not enable a Turso fallback, dual write, or runtime backend selector.
4. After explicit sign-off, revoke any remaining Turso credentials and remove
   them from deployment dashboards and CI secret stores.
5. Keep the draft refactor PR open until the deployed sign-off evidence is
   attached. If any acceptance gate fails, stop the cutover and report the
   failing measurement instead of routing production traffic through a
   partially configured stack.
