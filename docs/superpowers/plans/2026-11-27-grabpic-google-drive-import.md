# GrabPic recovery and Drive execution plan

Updated 2026-11-28 from current master
`f0ca64dfe06668b44bcd0cd0ab889d10f5b83802`.
Design: [Drive import](../specs/2026-11-27-grabpic-drive-import-design.md).
Audit: [production readiness](../../audits/2026-11-27-production-readiness.md).

## Corrections to original assumptions

- OCI is unavailable; Render is intended, with instance size/cost still unapproved.
- Four-day Queue retention is not universal: free is fixed 24h. Live plan/settings
  must be read; retry count alone cannot recover messages that expire silently.
- Processor health proves SQLite liveness, not usable FaceNet or matching accuracy.
- Existing upload confirmation is organizer-authenticated. Background import must
  gain a separate event-bound service path, not retain the organizer bearer token.
- `drive.file` recursive access is unproven; do not implement against that assumption.
- Phase 1 accepts one processing submission per event and free events cap at 100;
  repeated imports/manual upload mixing must obey that existing restriction.
- Daily cron is not exact-time physical deletion at 30 days. Existing longer-lived
  rows and signed-upload deletion races require explicit verification/remediation.

## Execution gates

1. **Production hardening, now.** Branch from current master; TDD public expiry,
   uploader HTTP errors, configured share/QR destinations and processor readiness.
   Prepare Render disk/single-process configuration. Address queue expiry recovery,
   bounded processor payload retention and orphan write races or keep blockers open.
   Run frozen install, lint/build, full Vitest, Python units/compile, Worker dry run
   and Pages Function compile. Produce hardening PR for review; do not merge master.
2. **Render staging.** Manav approves plan/disk and supplies account access/secrets.
   Deploy the reviewed image; measure RSS, readiness and warm/cold inference, restart
   recovery and callback behavior. Verify queue retention, routing, cron and Pages
   using disposable staging only. No paid provisioning until approval.
3. **Permission spike.** Use app OAuth client/test user and disposable fixtures:
   private, shared, resource-key-protected, inaccessible and revoked folder. Picker
   selects folder, then official API must enumerate/read unselected children. Record
   scope/grant/request outcomes without credentials. If broader scope is required,
   document restricted-scope verification/security assessment before adoption.
4. **Contracts and schema.** Create `convex/driveImports.ts`, schema tables/indexes,
   shared types and `routes/drive-imports.ts`. Implement short-lived encrypted OAuth
   state/PKCE, event binding and one-use callback. Tests deny unauthenticated,
   cross-event, expired/replayed state and wrong redirect requests.
5. **Durable engine.** Add `src/lib/google-drive.ts`, `drive-import.ts`, separate
   queue and reconciliation. Page discovery, reserve cap, deterministic copies,
   byte bounds, leases/checkpoints, revocation/backoff and compensation. Test a
   50-photo interrupted import resumes with exactly-once accounting.
6. **Processing integration.** Share validated confirmation primitives in
   `convex/uploads.ts`; service finalizer creates one processing job only after all
   files accounted. Test empty/partial imports, duplicate finalization, cancellation
   and deletion racing downloads. Preserve pinned model and callback barriers.
7. **Organizer UI.** Add focused component and API methods. Keep device upload,
   authority/consent boundaries, token controls and share UI. Exercise progress
   restore, failure/reconnect, cancel and retry in browser before screenshots/review.
8. **Pilot acceptance.** Run actual authorized Drive → R2 → processing → match →
   deletion; confirm Drive originals unchanged. Collect unauthorized denial, retry,
   restart, expiry/deletion, alert, memory and p95 evidence. Update runbook and feature
   PR with exact results. NO-GO while any required real-stack gate remains unverified.

Each code slice uses failing test → minimal fix → targeted test, then the full suite
once integrated. Tests use existing route/Convex/processor public seams. Feature
branch starts from integrated hardened master; no feature merge before hardening.
Owner-only external blockers do not prevent independent safe code/document work.

## Required configuration before feature release

Google OAuth consent screen, verified domains, exact callback URI, Picker API/key
restrictions, test users, client credentials and encrypted-token Worker key; any
restricted-scope verification/assessment. Configure import Queue and cron recovery,
Convex schema/service functions, quotas, trusted web origin and fixed redirects.
Rollback disables new Drive connect/import while preserving status/cancel/cleanup;
retain durable state until imports and credentials are settled. Never delete Drive
source files during rollback. Keep manual upload usable throughout.

Current stopping gate: GP-02 remains unresolved. Cancel-first stale reconciliation
would permanently tombstone a reused processing job ID; make cancellation attempt-aware
or revise job identities with regression tests before recovery. GP-05 is documented
maintenance only. Drive implementation has not started; this is a proposed design,
not an implemented feature or successful permission spike.
