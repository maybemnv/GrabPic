# Organizer-authorized Drive import design

Status: proposed, implementation blocked by permission spike and production-hardening
verification. Baseline: `f0ca64dfe06668b44bcd0cd0ab889d10f5b83802`.
See [production audit](../../audits/2026-11-27-production-readiness.md).

## Decisions

Keep manual upload, private R2, event-scoped Convex state and the pinned FaceNet
pipeline. Replace OCI hosting with Render; do not implement a second inference path.
Use a separate Cloudflare import queue carrying only import/file IDs; Convex owns
checkpoints. No folder-sized downloads or token-bearing queue messages.

Before choosing OAuth scope, prove the app's own OAuth client can enumerate/read a
selected disposable folder, including children not individually selected in Picker.
`drive.file` is preferred but recursive access is unproven. A connected assistant's
Drive credentials are not that test. If insufficient, stop for a documented scope
choice: explicit photo selection or restricted `drive.readonly`, Google verification
and applicable security assessment. Do not silently broaden permissions.

V1 imports immediate folder children only, JPEG/PNG/WebP, no recursive traversal,
shortcuts, Docs, videos or arbitrary URLs. Accept only explicit supported
`https://drive.google.com/drive/folders/<id>` and `/file/d/<id>/view` where appropriate;
folder start must resolve to folder MIME. Resource keys are parsed separately,
bounded and sent only to Google's API. Never fetch the supplied URL itself.

## Interfaces

All organizer endpoints require the existing event organizer bearer token and return
existing `{error, code}` failures. Shared request/response types go in
`packages/types/src/index.ts`; routes remain thin.

| Method/path | Contract |
| --- | --- |
| POST `/events/:eventId/integrations/google/connect` | Event auth; create short-lived one-use OAuth state bound to event and PKCE challenge; return authorization URL. |
| GET `/integrations/google/callback` | Validate state/expiry/event/one-use, exchange code with verifier; persist encrypted short-lived credentials; redirect to fixed trusted organizer origin without tokens in URL. |
| POST `/events/:eventId/imports/drive` | Authorized folder ID/resource key and authority confirmation; atomically reserve event ingestion; return 202 importId. |
| GET `/events/:eventId/imports/:importId` | Event and import binding; sanitized status, folder name, discovered/imported/skipped/failed counts. |
| POST `/events/:eventId/imports/:importId/cancel` | Event binding; idempotent cancelling state; stop downloads, compensate orphan writes, revoke/erase credentials. |

No organizer bearer token is retained for background jobs. A service-authenticated
finalizer uses durable event/import binding rather than weakening `uploads.confirm`.

## State and invariants

Add `driveImports` with event ID, folder ID, status, page token, discoveryComplete,
counts, timestamps, bounded error, connection reference and cancellation generation.
Add `driveImportFiles` indexed by event/source ID/version and import/state: source
ID, immutable version, expected size/MIME, deterministic photo ID/key, state,
retry count, observed R2 size and sanitized error. Unique checks run transactionally.
Changed versions within an import fail/retry discovery rather than mix snapshots.
Repeated imports cannot bypass one-processing-submission-per-event or free cap 100.

Store OAuth secrets in a separate service-only collection, AES-GCM encrypted using
a Worker secret and random nonce; authenticated data binds event/connection/key version.
Encrypt verifier and access/refresh credentials; keep only the shortest practical
lifetime, never return them in status/logs. Delete on completion/cancel/expiry;
provider revocation is best effort with recorded retry, local denial is immediate.

Paginate `files.list` with explicit fields, parent constraint, trashed=false and
shared-drive options as needed. Stream `files.get alt=media` into R2 with byte bounds,
expected Content-Length and actual stored-size verification. Validate metadata and
bytes before finalization; decoder failures remain explicitly accounted. Check
Cloudflare streaming/subrequest/CPU limits with a deployment spike before settling
page/concurrency sizes. Start concurrency one; no new orchestrator dependency.

File transitions: discovered → copying → stored → confirmed; terminal skipped/failed.
Claim by transaction/lease; duplicates inspect durable state and HEAD deterministic
key rather than create new records. Retry network/429 and eligible 5xx with bounded
backoff; inaccessible/revoked 403/404 requires reconnect or terminal failure. Never
log provider bodies/tokens. Exhaustion updates durable state even if queue expires;
cron reconciliation must discover expired leases. A queue delivery is not the ledger.

Finalize only after discoveryComplete and every discovered file terminal. Empty
imports fail. In one idempotent mutation create photos and one existing processing
job for confirmed R2 objects, then use the established processing queue. Refactor
shared confirmation validation only where required; do not store organizer token.
A deleting event rejects claims, finalization and callbacks. After an in-flight PUT,
recheck cancellation generation and remove the object if the claim is stale. Deletion
must wait/compensate active import writes before the final prefix sweep.

## UI and acceptance

Add focused organizer Drive import component using `apps/web/src/lib/api.ts`.
Preserve device uploader and share controls. Persist event/import references without
placing bearer tokens in URLs; restore tracked progress after refresh using existing
or deliberately designed secure organizer session handling. Show explicit authority
checkbox, connection, folder, counts, skipped/errors, cancel and reconnect/retry.
Attendee consent remains mandatory and unchanged.

Acceptance: real selected folder → 50 photos → private R2 → Convex → pinned processor
→ ready → consented selfie gallery → deletion; originals still present in Drive.
Test duplicate deliveries/imports, revoked grants, partial decode failures, worker
restart, event deletion during PUT and cross-event authorization. Report p95 and RSS.
No readiness declaration from mocks or skipped integration tests.
