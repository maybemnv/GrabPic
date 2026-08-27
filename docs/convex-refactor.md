# GrabPic Turso-to-Convex Implementation Plan

## Summary

Perform a direct cutover from the empty Turso project to Convex on
`refactor/convex-data-layer`, created only after the P0 branch is clean,
committed, deployed, and production-signoff tests pass.

Keep Hono as the sole public API boundary, R2 for assets, Modal for ML, and
Cloudflare rate limiting. The Worker calls Convex through
`ConvexHttpClient`; Modal persists results through an authenticated private
Worker callback. Do not add dual writes, a backend selector, a Turso importer,
or direct frontend Convex access.

Keep five-second status polling. Do not add direct Convex realtime
subscriptions in this migration; the migration must preserve and enforce
whatever organizer-management authorization boundary exists in the final
signed-off P0 baseline.

## Implementation Stages

### 1. Freeze and measure the Turso baseline

- Complete external P0 validation: real upload → R2 → Modal → thumbnails and
  embeddings → real match → signed gallery, deletion, and expiry.
- Record the signed-off commit SHA, deployed environment, model weights,
  fixture manifest, service versions, backend LOC, and deployment steps.
- Create deterministic non-real biometric fixtures covering same-event matches,
  a non-match, and the same identity in a second event.
- Capture Turso measurements for event creation, status updates, invite lookup,
  match correctness, match p50/p95, warm and cold selfie-to-gallery latency,
  deletion, and expiry.
- Run a final read-only Turso row count. If meaningful records exist, stop and
  write a one-time export/import plan. Otherwise proceed with fixture-only
  cutover.
- Create `refactor/convex-data-layer` from the recorded P0 SHA only after the
  P0 signoff. This plan branch itself is based on `master` and contains no P0
  implementation.

### 2. Add the Convex foundation

Place the Convex project under `apps/api/convex/`; add Convex scripts and
dependencies only to `apps/api`.

Define these tables:

- `events`: external `publicId`, name, passcode, opaque invite token, Unix-second
  timestamps, status, counts, organizer metadata, max photos, tier, matching
  threshold/configuration, and retryable deletion state.
- `photos`: external `publicId`, typed event reference, original and thumbnail
  keys, upload metadata, dimensions, file size, processing state, and face
  count.
- `faces`: external `publicId`, typed event and photo references, bounding box,
  confidence, cluster, landmarks, and the 512-number embedding.
- `matchSessions`: event reference, matched count, threshold, duration, and
  timestamp. Do not retain raw IP addresses.
- `processingJobs`: external job ID, event/photo references, status, Modal job
  ID, attempts, sanitized error, and timestamps.

Create only access-driven indexes: event public ID/passcode/invite/expiry,
photo event and event/public ID, face event/photo/event-public ID, job
public ID/event-status, and a face vector index with 512 dimensions and
`eventId` as a filter field.

Every callable Convex function must validate arguments and a Worker-only
service secret. Never log function arguments containing embeddings or secrets.

### 3. Migrate event, upload, and state access

- Add a request-scoped `apps/api/src/lib/convex.ts` helper using
  `ConvexHttpClient`; do not introduce a repository abstraction or runtime
  backend flag.
- Replace inline SQL in event, QR, upload, health, and status routes with typed
  Convex calls.
- Preserve the signed-off P0 endpoint paths, response fields, error envelopes,
  invite/passcode behavior, external IDs, and status codes. Never expose Convex
  `_id` values.
- Make upload confirmation idempotent and atomic: require the organizer
  authorization/ownership validation established by the signed-off P0
  baseline, validate event existence and state, enforce `maxPhotos`, recognize
  already-confirmed photo IDs, avoid duplicate photo-count increments, and
  create or reuse exactly one processing job for the submission.
- After the Convex mutation succeeds, the Worker invokes Modal and requires an
  explicit acceptance response containing a real Modal job identifier. Persist
  that accepted job ID before returning `202 Processing`. If Modal does not
  accept the request, return the documented failure status (preferably `502`),
  retain the Convex job in an observable retryable state, do not mark the event
  ready, and do not silently swallow the trigger failure.
- Keep the organizer's existing five-second polling flow.

### 4. Replace the similarity scan

Implement a Convex matching action that:

1. Validates event readiness and uses the server-owned event threshold.
2. Validates a finite, non-zero, 512-dimensional normalized selfie vector.
3. Searches the face vector index with mandatory equality filtering on the typed
   event ID.
4. Requests up to 256 candidates, applies the inclusive threshold, deduplicates
   by photo using the best face, and preserves the existing 100-photo ceiling.
5. Loads photo and face metadata through an internal query.
6. Lets the Worker sign original and 800px R2 keys with the existing P0 policy.
7. Records match metrics without the selfie vector or raw IP.

The 256-candidate Convex limit is an explicit acceptance risk: representative
fixtures must prove that required results are not lost.

### 5. Move Modal persistence behind the Worker

- Keep the signed-off MTCNN/InceptionResnetV1 weights, confidence threshold,
  normalization, clustering, thumbnail generation, and stable R2 key scheme.
- Add a private Hono callback authenticated by a dedicated
  `MODAL_CALLBACK_TOKEN`.
- Modal sends idempotent result batches containing job/event IDs, photo
  metadata, thumbnail keys, and no more than 25 faces per batch. Each face
  contains its ID, box, confidence, cluster, landmarks, and 512-number vector.
- Callback bodies containing embeddings, embeddings themselves, and service
  secrets must never be logged or attached to Sentry/error metadata.
- Worker validation must require the callback job ID and event ID to agree with
  the existing processing job, every returned photo to belong to that
  event/job, every face to belong to a returned/known photo, and every
  embedding to be finite, normalized, and exactly 512-dimensional.
- Convex upserts by event-scoped public IDs and rejects wrong-event and
  stale-job payloads. Duplicate callback delivery is idempotent. Callbacks
  received after an event enters `deleting` or has been deleted are rejected
  and must never recreate biometric state.
- Modal sends a final summary only after every batch succeeds. Completion marks
  the job and event ready; failure records a sanitized retryable error.
- Duplicate upload confirmation and callback delivery must not duplicate rows,
  counts, or jobs.
- Remove `libsql-client` and Turso secrets from Modal after staging E2E passes.

### 6. Preserve deletion and expiry guarantees

Keep the Cloudflare scheduled Worker as the external-side-effect coordinator:

1. Mark the event `deleting`, excluding it from lookup, upload, and matching.
2. Cancel queued/running Modal work using the production cancellation contract.
3. Read all event R2 keys from Convex and delete originals and both thumbnails.
4. On any cancellation or R2 failure, retain records, record attempts/error,
   report to Sentry, and retry later.
5. Purge faces, photos, sessions, and processing jobs in bounded batches of 500,
   deleting the event last.
6. Make cancellation, object deletion, callback, and purge operations
   idempotent.
7. Query expired events through the expiry index and use the same workflow.

### 7. Remove Turso and reconcile documentation

After all callers use Convex:

- Delete `packages/db`, SQL migrations, migration commands, `@libsql/client`,
  Python `libsql-client`, and Turso test helpers.
- Remove `TURSO_URL`, `TURSO_TOKEN`, Turso secrets, and the unused D1 binding.
- Add `CONVEX_URL`, `CONVEX_SERVICE_SECRET`, and `MODAL_CALLBACK_TOKEN` to
  deployment configuration and `.env.example` without values.
- Update README, deployment docs, AGENTS.md, diagrams, API examples, and
  progress/status docs so Convex is the only application database.
- Deploy in order: Convex functions, Modal callback integration, Worker
  cutover, smoke tests, then revoke Turso credentials.
- Repository-wide searches for `turso`, `libsql`, `TURSO_`, SQL migrations, and
  D1 must return no active runtime or architecture references.

## Public Interfaces and Tests

Public API contracts remain the signed-off P0 contracts. Any intentional
failure-status change must be documented and covered by contract tests. Convex
IDs and service credentials never enter public responses.

Run:

- `pnpm lint`
- `pnpm build`
- `pnpm vitest run`
- Convex code generation and deployment checks
- `python -m unittest ml/test_processor.py`
- `python -m compileall ml`

Add focused tests for schema/access validation, service authentication,
organizer ownership authorization, event existence/state validation,
max-photo enforcement, recognition of already-confirmed photo IDs,
idempotent upload confirmation, exactly-one processing-job creation,
explicit Modal acceptance before `202`, trigger failure status and retryable
job state, invite/passcode lookup, event-filtered vector search, threshold
boundaries, ranking, deduplication, malformed vectors, Modal batch validation,
duplicate callbacks, wrong-event callbacks, stale-job rejection,
callback-after-deletion rejection, processing completion/failure, no raw
IP/vector persistence, partial R2 deletion, cancellation failure, retry,
batched purge, expiry, and signed R2 delivery.

The callback-after-deletion race is mandatory before cutover acceptance:

1. A Modal job is processing.
2. Event deletion begins and the event enters `deleting`.
3. A delayed Modal callback arrives.
4. Worker/Convex reject it.
5. No photos, faces, embeddings, counts, or processing state are recreated.

Run real Convex staging tests in addition to mocked Convex tests, because the
mock does not reproduce production ANN behavior or backend limits.

Run the same deterministic deployed E2E fixture against Turso and Convex.
Convex passes only when expected membership and event isolation are unchanged,
scores remain within `0.01` for deterministic vectors, API p95 is no more than
10% slower than Turso, representative selfie-to-gallery p95 remains below five
seconds, assets open, and deletion/expiry leave no Convex, R2, or Modal state.

## Final Evaluation and Stop Rules

Produce `docs/convex-evaluation.md` with the Turso-versus-Convex comparison:
architecture, runtime services, backend LOC, matching/E2E latency,
state-management complexity, deployment requirements, pricing-based operating
estimate, and remaining risks.

Stop without merging if P0 signoff is incomplete, event isolation or match
membership regresses, the five-second target fails, the 256-candidate ceiling
loses required matches, deletion is not safely retryable, Turso remains in the
runtime, or Convex does not reduce complexity enough to justify the added
function layer.

Assumptions: Turso is empty; cutover occurs before public traffic; status stays
Worker-polled; the migration preserves and enforces whatever
organizer-management authorization mechanism is present in the final
signed-off P0 baseline; and the frontend does not connect directly to Convex.
