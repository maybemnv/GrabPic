# Production Deployment Readiness

This document is not just a hosting guide. It is the current-state checklist of what is still left before GrabPic can be treated as a production product.

As of July 11, 2026, the repo is partially deployable as infrastructure, but not fully production-ready as a working product. The main gap is not hosting. The main gap is that parts of the photo-processing and match-delivery path are still placeholder or incomplete.

## Status Summary

Current state:
- Frontend exists and is usable as a UI shell.
- Cloudflare Worker routes exist for event creation, upload, status, delete, QR, and match.
- Modal processor exists as a standalone ML worker.
- Scheduled expiry cleanup exists in the Worker.
- Basic docs, tests, and observability hooks exist.

Not production-ready yet because:
- The live match flow is still placeholder logic.
- The Modal trigger contract does not match the processor implementation.
- Photo result delivery endpoints are missing.
- Thumbnail generation/storage is not wired end-to-end.
- Share and QR flows are incomplete for real attendee onboarding.
- Several deployment and hardening tasks are still undone.

## P0 Blockers

These should be treated as release blockers. Do not call the product production-ready until these are resolved.

### 1. Real selfie matching is not implemented yet

Current behavior:
- `POST /events/:eventId/match` validates passcode and event status.
- It does not generate a real selfie embedding.
- It does not run actual cosine similarity against stored embeddings.
- It returns synthetic similarity values derived from row order.

Impact:
- The core product promise is not actually implemented in production terms.
- A deployed system would look functional but produce fake or misleading match quality.

Required before production:
- Generate the selfie embedding server-side using the same model family and weights as batch processing.
- Read stored embeddings for the event.
- Compute actual similarity scores.
- Return only real matched photos.
- Define and enforce a production threshold policy.

Relevant files:
- `apps/api/src/routes/match.ts`
- `ml/processor.py`

### 2. The Worker -> Modal contract is inconsistent

Current behavior:
- The upload confirm route posts `{ event_id, photo_ids }` to `MODAL_WEBHOOK_URL`.
- The Modal processor function currently expects `process_event(event_id, photo_urls)`.
- There is no implemented adapter layer in this repo that turns `photo_ids` into actual R2-accessible photo URLs for the processor.

Impact:
- Processing can fail even if the Worker is deployed correctly.
- The API and ML service are not actually integrated end-to-end yet.

Required before production:
- Pick one contract and implement it fully.
- Either send signed/readable R2 URLs to Modal, or make Modal fetch photo keys directly from R2 using bucket credentials.
- Define the invocation surface clearly: webhook, RPC, or queue-driven job.
- Persist a real job identifier if job cancellation/deletion matters.

Relevant files:
- `apps/api/src/routes/upload.ts`
- `ml/processor.py`

### 3. Match result asset delivery is incomplete

Current behavior:
- Match responses return paths like `/api/photos/:id` and `/api/thumbs/:id`.
- There are no routes implementing those endpoints in the Worker.

Impact:
- Even if a match is found, attendees cannot reliably open the resulting images.
- Gallery links are effectively placeholders.

Required before production:
- Add Worker routes to return signed original-photo URLs and signed thumbnail URLs.
- Or return signed R2 URLs directly from the match route.
- Decide URL expiration policy and cache policy.

Relevant files:
- `apps/api/src/routes/match.ts`
- `apps/api/src/index.ts`

### 4. Thumbnail generation is not wired end-to-end

Current behavior:
- The schema supports `thumbnail_200_key` and `thumbnail_800_key`.
- The product docs assume thumbnails exist.
- The current processor does not generate thumbnails or write thumbnail keys back to the database.

Impact:
- Gallery performance and image previews are incomplete.
- Returned thumbnail URLs cannot be trusted to exist.

Required before production:
- Generate 200px and 800px thumbnails during processing.
- Store thumbnail object keys in the `photos` table.
- Ensure cleanup deletes originals and thumbnails consistently.

Relevant files:
- `packages/db/src/index.ts`
- `ml/processor.py`
- `apps/api/src/lib/event-cleanup.ts`

### 5. Share link and QR flow are incomplete

Current behavior:
- Event creation returns `https://grabpic.app/e/{passcode}`.
- `/e/[code]` redirects to `/attendee?code=...`.
- The attendee page currently requires manual `eventId` entry and does not consume the `code` query param.
- The QR route uses only passcode-based navigation, but the attendee flow still depends on event ID.

Impact:
- Organizer share flow is not coherent.
- QR scans and share links do not complete the intended user journey.

Required before production:
- Decide the actual attendee entry model:
  - passcode only, or
  - passcode + event lookup, or
  - opaque invite token.
- If passcode-only, add lookup by passcode and auto-resolve event context.
- If event ID remains required, stop advertising passcode-only links and QR codes.

Relevant files:
- `apps/api/src/routes/events.ts`
- `apps/api/src/routes/qr.ts`
- `apps/web/src/app/e/[code]/page.tsx`
- `apps/web/src/app/attendee/page.tsx`

### 6. Production access control is too weak

Current behavior:
- Organizer flows are unauthenticated.
- Match requests are passcode-protected only.
- There is no rate limiting on the match route.

Impact:
- Abuse risk is high.
- Organizer event management is not protected strongly enough for public production.
- Passcode brute-force and traffic abuse are realistic concerns.

Required before production:
- Add rate limiting on `POST /events/:eventId/match`.
- Add some organizer auth model before public multi-tenant launch.
- Add basic abuse controls for event creation and upload endpoints.

This may be acceptable for a private pilot with trusted organizers, but it is not enough for open public production.

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

Current issue:
- `apps/api/wrangler.toml` still includes a `[[d1_databases]]` block with an empty `database_id`.
- The current API code uses Turso, not Cloudflare D1.

Required before production:
- Remove the unused D1 binding, or
- Intentionally migrate to D1 and then update the code accordingly.

Do not leave the current blank D1 config in a production deployment path.

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
- Remove or resolve the unused D1 binding.
- Deploy Worker.
- Attach `api.grabpic.app`.
- Verify cron trigger for expiry cleanup.

### 4. Modal

Still required:
- Create production Modal app/account setup.
- Store Turso credentials as Modal secrets.
- Decide how Modal reads originals and writes thumbnails.
- Deploy `ml/processor.py`.
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

GrabPic is not blocked by frontend scaffolding or basic infrastructure code. It is blocked by a handful of core production-path gaps:
- real matching,
- real ML integration,
- real asset delivery,
- real thumbnail pipeline,
- real attendee entry flow,
- and minimum abuse protection.

Once those are done, the remaining work becomes normal deployment and operations.
