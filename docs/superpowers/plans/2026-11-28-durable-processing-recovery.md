# Durable processing recovery implementation plan

Goal: recover lost or expired dispatch messages from durable Convex state and bound processor payload retention without weakening deletion or idempotency.
Base: fix/production-hardening at 31e3044b62fe97c8d2024e201db69502d334abb1; stacked PR targets that branch.

Architecture decision: replay the existing job and attempt from a durable outbox. Do not cancel ambiguous dispatches: cancellation tombstones intentionally prevent their resurrection, and cancellation before retry conflicts with reused IDs. Record processor delivery separately from queue acceptance. A scheduled bounded indexed scan replays only undelivered pending/accepted work. Callback progress and terminal/deleting states exclude replay. Provider queue retention is no longer the source of truth.

- [ ] Add expiry/lost-message regression with no original queue delivery or DLQ.
- [ ] Add indexed bounded Convex reconciliation and delivery acknowledgement; preserve stale-attempt guards and callback races.
- [ ] Reconcile hourly; keep send failure retriable and duplicate delivery idempotent.
- [ ] Cover DLQ ambiguity: do not fail a possibly running processor job solely because queue acknowledgement failed.
- [ ] Implement safe processor retention only after replay constraints are explicit; preserve legacy tombstones and running jobs.
- [ ] Run full local verification and independent review; commit each coherent change.
- [ ] Update production gap register and deployment migration order; open stacked PR.

Drive remains gated on production code checks and the actual app OAuth permission fixture. Render billing and live provisioning remain owner actions. No production data edits or secrets rotation.
