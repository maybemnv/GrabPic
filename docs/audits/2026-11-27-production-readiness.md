# GrabPic production recovery audit

Audit performed 2026-11-28 against freshly fetched `origin/master`:
`f0ca64dfe06668b44bcd0cd0ab889d10f5b83802`. The supplied November 27 baseline
is still current. This report separates repository evidence from deployed behavior.
No production resources or customer data were changed by this audit.

## Decision

**NO-GO for a private pilot.** Code fixes alone cannot establish the missing
processor, routing, queue, deletion, accuracy and latency evidence. Drive feature
implementation is gated on hardened code verification and a real permission spike.
The owner authorizes Render as OCI's replacement; older OCI instructions are historical.

## Gap register

Line references describe the baseline unless explicitly marked as changed.

| ID | Severity | Evidence / reproduction | Impact and resolution | Status / verification |
| --- | --- | --- | --- | --- |
| GP-01 | P0 | `docs/deployment.md:1-26`, `ml/Dockerfile:1-24`: OCI-specific operating instructions; no Render declaration at baseline. Owner reports OCI access lost. | No available inference host. Prepare single-process Docker Render service with persistent SQLite disk; provision only after owner approves resource cost. | Render configuration being prepared; deployment, actual disk persistence and memory remain unverified. Owner: Manav. |
| GP-02 | P0 | `apps/api/wrangler.toml:20-25` assumes four-day retention; `apps/api/src/index.ts:169-188` retries dead letters up to one hour apart. Historical checkpoint reports 24h retention. | Retry lifetime can exceed retention. Expired messages may disappear without reaching DLQ, stranding Convex state. Confirm actual queue plan/settings; add or verify stale-dispatch recovery independently of DLQ delivery. | Unresolved until retention and expiry/recovery tests pass. Live settings unverified. Owner: engineering for recovery; Manav for provider settings. |
| GP-03 | P0 | `apps/api/src/routes/events.ts:23` accepts expiryDays 90; event creation computes expiry from it. | Contradicts 30-day policy. Reject >30 through public API with regression test. Existing long-lived events require owner-approved audit/remediation; do not silently rewrite production data. | Public-path fix assigned. Existing rows and deployed enforcement unverified. Daily cron permits deletion lag; do not promise exact-time erasure. |
| GP-04 | P0 | No current traceable deployed acceptance evidence supplied. Unit suites use mocked infrastructure; opt-in suites require explicit enablement. | Full photo journey cannot be claimed. Run disposable event upload → process → consented match → deletion with recorded IDs and timings. | Unverified; release blocked. Owner: Manav + engineering. |
| GP-05 | P1 | `ml/server.py:29-44,205-230`: jobs have no timestamps or pruning; cancellation stores permanent tombstones, payloads retained. | SQLite growth and source-photo metadata retention. Define bounded terminal payload cleanup; never erase tombstones while delayed dispatch/replay is possible. Disk monitoring required. | Bounded cleanup not demonstrated. Keep this gate open until cleanup and replay tests exist. |
| GP-06 | P1 | `ml/server.py:111-115,150-154`: preload errors swallowed; health checks SQLite only. | Healthy service may have unusable model. Separate liveness from readiness, mark ready only after pinned model loads; perform real inference fixture as deployment acceptance. | Readiness fix assigned; actual inference/accuracy remains unverified. |
| GP-07 | P1 | `apps/web/src/app/organizer/page.tsx:57-65`: fetch PUT promises resolve for HTTP errors, then confirm is called. | Failed uploads appear successful to UI. Check every PUT response.ok; abort confirmation and surface failure. | Fix assigned; regression verification required. |
| GP-08 | P1 | `apps/api/src/routes/events.ts:92-93`, `apps/api/src/routes/qr.ts:41`: fixed production hosts. | Preview/custom hosts share wrong invite/QR destination. Configure trusted web base URL and derive API origin from request; test both route outputs. | Fix assigned; live host configuration unverified. |
| GP-09 | P1 | Historical deployment checkpoint in `docs/deployment.md:28-50` reports paused queues, no Pages deployment, cron/routing inactive. Wrangler source includes bindings and cron, which does not prove activation. | No automatic processing or expiry. Owner must inspect and activate staging resources after prerequisites; verify delivery and scheduled execution. | Current live state unverified. Owner: Manav. |
| GP-10 | P1 | `.github/workflows/ci.yml:35-44` explicitly runs processor contracts without inference; no measured host memory or p95 here. | Unknown matching quality, capacity, alert delivery and deletion behavior. Capture warm/cold timings, peak RSS, failure alerts and deletion evidence. | Unverified. Owner: engineering + Manav. |

## Additional boundaries and risks

- Organizer access is checked at Worker and Convex boundaries. `uploads.confirm`
  requires organizer hash and service secret, checks active event, counts and existing
  job; `processing.getDispatchState` rejects deleting/missing events and stale attempts.
  `processing.persistResults` checks job ownership, normalized 512-vector input,
  confidence, thumbnail keys, duplicate faces and a completion barrier. Preserve these.
- Deletion calls processor cancellation before R2 purge (`event-cleanup.ts:87-118`),
  lists the event prefix including unconfirmed objects, and retries failed purges via
  persisted deleting state. Cancellation tombstones prevent delayed queue delivery.
  Real deletion races remain unverified. A signed PUT already issued can outlive
  deletion and recreate an object after the prefix sweep; expiry cleanup of orphan
  prefixes and signed-URL lifetime need an explicit acceptance test before release.
- Upload confirmation HEAD-checks R2 objects and rejects invalid stored sizes
  (`routes/upload.ts:157-188`). Content-type declarations do not prove valid image
  bytes; decoder failures must remain accounted as skipped/failed rather than hang.
- The API's `/health/processing` checks Convex, not the whole processing chain.
  No alerting claim follows from Sentry configuration alone.
- Drive OAuth does not exist at baseline. A connected assistant's Google Drive
  access would not prove the application's own OAuth client or `drive.file` grant.

## Verification ledger

The main implementation report must append exact observed commands/results before
claiming green. At audit time `pnpm` was missing from the shell PATH, so the first
install and Vitest attempt returned command-not-found; no suite passed in that attempt.
Real-infrastructure tests are **not run** by this audit. Preserve passing/failing,
skipped and not-run counts separately. CI source is intended coverage, not a result.

Required: frozen install; workspace lint; build with test API URL; full Vitest;
Python unit tests and compileall; Worker dry run; Pages Function compilation. Record
real inference, Docker build, Render persistence and browser flow separately.

## Owner release requirements

1. Approve Render plan/disk cost after measuring container RSS; $50 credits are owner
   reported and coverage is unverified. Supply existing processor/R2 secrets securely.
2. Deploy staging processor and prove `/health`, `/ready`, authenticated endpoints,
   restart recovery and persistent SQLite. Keep one process/instance.
3. Set Worker processor URLs, trusted web URL, CORS and callback host consistently.
4. Verify queues' actual retention and delivery state, cron, Pages and routes; exercise
   retry exhaustion and paused/expired messages without changing production data.
5. Supply disposable authorized photos/selfie and Google OAuth client/test account.
6. Complete manual and Drive acceptance traces including original Drive preservation,
   cancellation, deletion race, expiry, warm/cold p95 and peak RSS. Five-second p95
   remains a release gate, not a prediction.

## Primary references checked for this design

- [Cloudflare Queue limits](https://developers.cloudflare.com/queues/platform/limits/)
  and [pricing](https://developers.cloudflare.com/queues/platform/pricing/): free
  retention 24h non-configurable; paid defaults four days, configurable up to 14 days.
- [Google Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth):
  `drive.file` grants selected-file access; do not infer recursive folder-child access.
- [Render persistent disks](https://render.com/docs/disks): persistent storage is a
  deployment requirement for SQLite; attach and verify the actual mount before cutover.

## Integrated local verification update

Parent implementation reports: lint and build pass; Vitest **112 passed, 16 skipped**;
Python **25 passed**; Render YAML schema checked. The initial Vitest run overlapped
new failing regression tests (107 passed, 16 skipped, 2 expected failures), so it is
not a pristine baseline result. Docker/inference/browser/real infrastructure remain
not run unless the main report supplies separate evidence.

GP-02 remains a code blocker: a cancel-first stale-job reconciler is unsafe with the
current permanent job-ID tombstone because `uploads.confirm` retries reuse the job ID
with an incremented attempt; `/process` would return 409 forever. Resolve attempt-aware
cancellation or job identity before adding that recovery. Do not start Drive feature
coding while this P0 remains open. GP-05 currently has a documented maintenance path
only; automated bounded pruning is unverified. Never blindly purge tombstones.
