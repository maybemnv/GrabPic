# Production Deployment Readiness

This document is not just a hosting guide. It is the current-state checklist of what is still left before GrabPic can be treated as a production product.

As of August 27, 2026, the repository contains the implementation for the six P0 blocker paths. External staging/production verification is still required before a production claim.

## Status Summary

Current state:
- Frontend exists and is usable as a UI shell.
- Cloudflare Worker routes exist for event creation, upload, status, delete, QR, and match.
- Modal processor exists as a standalone ML worker.
- Scheduled expiry cleanup exists in the Worker.
- Basic docs, tests, and observability hooks exist.

Code-level blocker status:
- Real FaceNet matching, Modal processing, signed asset delivery, thumbnails, opaque invites, and Cloudflare rate limits are implemented.
- Organizer identity/authentication is not implemented; open public multi-tenant launch remains blocked on that external product decision.
- No live integration or production verification was available during this change.

## P0 Blockers

These should be treated as release blockers. Do not call the product production-ready until these are resolved.

### 1. Real selfie matching — code-level closed

Implemented behavior:
- `POST /events/:eventId/match` accepts a passcode or opaque invite token and validates event status.
- Modal `embed_selfie` uses `InceptionResnetV1(pretrained="vggface2")`, the same model and weights as batch processing.
- The Worker decodes event-scoped 512-value embeddings, calculates dot-product similarity for normalized vectors, applies `MATCH_THRESHOLD`, and deduplicates by photo.
- Malformed or failed Modal responses return a safe error without exposing embeddings.

Verification remaining: run the deployed Modal endpoint and a real event/selfie flow.

Relevant files:
- `apps/api/src/routes/match.ts`
- `ml/processor.py`

### 2. Worker -> Modal contract — code-level closed

Implemented behavior:
- Upload confirmation posts one stable contract to `MODAL_WEBHOOK_URL`:
  `{ "event_id": "...", "photos": [{ "photo_id": "...", "r2_key": "events/..." }] }`.
- Modal validates event-scoped keys and reads originals directly from R2 using its `grabpic-r2` secret.
- No expiring signed URL is used for processing.

Verification remaining: deploy the Modal app and confirm a real upload reaches the R2 object and returns `ready`.

Relevant files:
- `apps/api/src/routes/upload.ts`
- `ml/processor.py`

### 3. Match result asset delivery — code-level closed

Implemented behavior:
- Match responses return short-lived SigV4-presigned R2 GET URLs directly.
- The Worker uses `aws4fetch`; raw bucket URLs and placeholder `/api/photos/:id` or `/api/thumbs/:id` paths are not returned.
- Original and 800px thumbnail URLs expire after five minutes.

Verification remaining: open both returned URLs against the deployed R2 bucket.

Relevant files:
- `apps/api/src/routes/match.ts`
- `apps/api/src/index.ts`

### 4. Thumbnail generation — code-level closed

Implemented behavior:
- Modal writes deterministic 200px and 800px JPEGs to `events/<event_id>/thumbs/{200,800}/<photo_id>.jpg`.
- The processor persists both keys and original dimensions in Turso.
- Event deletion and scheduled expiry already delete original, 200px, 800px, face, embedding, and match-session records.

Verification remaining: confirm the two objects exist after a deployed processing job and are removed by deletion/expiry.

Relevant files:
- `packages/db/src/index.ts`
- `ml/processor.py`
- `apps/api/src/lib/event-cleanup.ts`

### 5. Share link and QR flow — code-level closed

Implemented behavior:
- Event creation stores a cryptographically random `invite_token` separately from the six-digit manual passcode.
- Share links and QR codes use `/e/<inviteToken>`; the passcode is not placed in user-facing URLs.
- The invite endpoint resolves event context, and the attendee page submits the invite token directly to matching.
- Manual attendees submit only the six-digit passcode; event ID entry is removed.

Verification remaining: scan a deployed QR code and confirm the consent-gated attendee flow reaches matching.

Relevant files:
- `apps/api/src/routes/events.ts`
- `apps/api/src/routes/qr.ts`
- `apps/web/src/app/e/[code]/page.tsx`
- `apps/web/src/app/attendee/page.tsx`

### 6. Abuse protection — code-level closed for controlled/private pilot

Implemented behavior:
- Cloudflare Rate Limiting is applied to event creation, upload initiation/confirmation, manual event lookup, and match requests.
- Match accepts either a six-digit passcode or an opaque invite token and never logs embedding data.
- No organizer identity provider exists in this repository, so organizer event management remains unauthenticated.

Status: rate limiting is implemented and the code is suitable for a controlled/private pilot. Organizer authentication remains the prerequisite for open public multi-tenant production.

## P1 Operational Gaps

These are not always code blockers, but they should be completed before a real launch.

### Infrastructure provisioning still left

- Create the production Turso database.
- Run schema migration against production.
- Create the production R2 bucket.
- Configure R2 CORS for browser direct uploads.
- Create and configure the production Modal app and secrets.
- Deploy the Worker.
- Deploy the frontend.
- Bind custom domains.
- Confirm the scheduled cleanup cron is running in production.

### Worker config cleanup

Status:
- The unused D1 binding has been removed from `apps/api/wrangler.toml`.
- The API continues to use Turso.
- The Worker now requires `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` for SigV4 upload/download URLs.

### CI/CD is still missing

Still left:
- GitHub Actions CI for lint, tests, and typecheck.
- Automated Worker deploy on protected branch push.
- Automated frontend deploy.
- Optional automated Modal deploy.
- Post-deploy smoke test step.

### Production verification is still missing

Still left:
- Run the full test suite against real infrastructure.
- Validate end-to-end upload -> process -> match -> gallery flow.
- Validate cron-based cleanup against real R2 and Turso resources.
- Validate deletion behavior for original photos, thumbnails, faces, embeddings, and sessions.

## Required Environment And Service Setup

These are the external systems that still need to exist for production.

### 1. Turso

Still required:
- Create `grabpic-prod` or equivalent production DB.
- Generate production auth token.
- Run schema migration.
- Store `TURSO_URL` and `TURSO_TOKEN` securely in Worker deployment and Modal secrets.

### 2. Cloudflare R2

Still required:
- Create production bucket.
- Generate object read/write credentials for Modal or any processing component that needs them.
- Configure browser upload CORS.
- Define lifecycle and backup expectations.

### 3. Cloudflare Worker

Still required:
- Fill production env vars.
- Configure the `RATE_LIMITER` binding from `apps/api/wrangler.toml`.
- Configure R2 S3 credentials as Worker secrets; never put them in `wrangler.toml` vars.
- Deploy Worker.
- Attach `api.grabpic.app`.
- Verify cron trigger for expiry cleanup.

### 4. Modal

Still required:
- Create production Modal app/account setup.
- Store `TURSO_URL` and `TURSO_TOKEN` in `turso-credentials`.
- Store `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` in `grabpic-r2`.
- Store the shared Worker/Modal bearer value as `MODAL_TOKEN` in `grabpic-modal-auth`.
- Deploy `ml/processor.py`.
- Set `MODAL_WEBHOOK_URL` to the deployed `process_event` endpoint and `MODAL_EMBEDDING_URL` to the deployed `embed_selfie` endpoint.
- Verify invocation path from Worker.

### 5. Frontend Hosting

Still required:
- Deploy `apps/web`.
- Set `NEXT_PUBLIC_API_URL` to the production Worker URL or custom domain.
- Set production PostHog public key if analytics remains enabled.
- Attach `grabpic.app`.

## Security And Privacy Checklist Before Launch

The privacy model is one of the product’s non-negotiables, so this section should be treated as mandatory.

Must verify before production:
- Selfie embedding generation is server-side only.
- Batch processing embeddings stay scoped to a single event.
- Embeddings are never logged.
- R2 raw bucket URLs are never exposed directly.
- Event deletion removes originals, thumbnails, faces, embeddings, and match sessions.
- Scheduled expiry removes expired event data from both DB and storage.
- Match and upload endpoints have abuse controls.
- Consent gating remains enforced in the attendee flow.

## Recommended Go-Live Order

Use this order rather than deploying everything at once.

### Phase 1: Finish blockers

1. Implement real matching.
2. Fix Worker <-> Modal integration.
3. Implement photo/thumb result delivery.
4. Implement thumbnail generation.
5. Fix share/QR onboarding flow.
6. Add minimum rate limiting.

### Phase 2: Provision infrastructure

1. Create production Turso DB and run migrations.
2. Create R2 bucket and configure CORS.
3. Configure Modal secrets and deploy processor.
4. Clean up `wrangler.toml` and deploy Worker.
5. Deploy frontend with production env vars.

### Phase 3: Verify end to end

1. Create a real event in production or staging.
2. Upload real photos.
3. Confirm processing completes.
4. Confirm thumbnails are generated.
5. Run a real selfie match.
6. Confirm gallery links open real signed assets.
7. Confirm deletion and expiry cleanup work.

### Phase 4: Automate deployment

1. Add CI.
2. Add protected-branch deployment.
3. Add smoke tests.
4. Add rollback instructions.

## Minimum Smoke Test For Production Signoff

Do not call the system production-ready until all of these pass in a deployed environment.

- `GET /health` returns 200.
- `GET /health/processing` returns DB-connected status.
- Organizer can create an event.
- Organizer can upload photos via signed URLs.
- Worker successfully triggers ML processing.
- Processor writes faces, embeddings, and thumbnail keys.
- Event status becomes `ready`.
- Attendee can enter through share link or QR without manual hidden knowledge.
- Attendee selfie returns real matched results.
- Returned image links open working signed assets.
- `DELETE /events/:id` removes DB rows and storage objects.
- Scheduled expiry removes an expired event automatically.

## Bottom Line

The six code-level P0 blockers are addressed. The repository is suitable for a controlled/private pilot after infrastructure deployment and end-to-end verification. Open public multi-tenant production remains blocked by organizer authentication, which is not present in this repository and was intentionally not invented in this pass.
