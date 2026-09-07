# Deployment

This is the current deployment contract. The public path is:

```text
Next.js -> Cloudflare Worker/Hono -> Convex
                         |          |
                         +-> R2     +-> event, photo, face, job state
                         +-> Modal -> authenticated Worker callback -> Convex
```

The Worker owns authorization, rate limiting, orchestration, R2 signing, and
the only public API. The frontend and Modal processor do not call Convex
directly. Modal has R2 credentials and the callback secret only; it has no
Convex credentials.

## Services

- Convex: authoritative application data, event-scoped face vector index,
  mutations, queries, and actions.
- Cloudflare R2: originals and deterministic 200px/800px thumbnails.
- Cloudflare Workers/Hono: public API, organizer authorization, signed URLs,
  Modal coordination, and the 30-day cleanup cron.
- Modal: pinned face detection, 512-dimensional embedding generation,
  clustering, and thumbnail generation.
- Next.js: organizer and attendee UI.

## Environment

Start from `.env.example`. Required Worker settings are:

```text
CONVEX_URL
CONVEX_SERVICE_SECRET
MODAL_TOKEN
MODAL_CALLBACK_TOKEN
MODAL_WEBHOOK_URL
MODAL_CANCEL_URL
MODAL_EMBEDDING_URL
R2_ENDPOINT
R2_BUCKET
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

Keep secrets in the Worker/Modal secret stores. Copy
`apps/api/.dev.vars.example` to `apps/api/.dev.vars` for Wrangler, and do not
commit `.env` or local variable files. `tests/local.env.example` is a local-only template
for an explicitly enabled infrastructure test run.

## Deployment order

1. Deploy the Convex functions and set `CONVEX_SERVICE_SECRET`.
2. Deploy Modal with R2 credentials, `MODAL_TOKEN`, and the callback URL/token.
   Verify `process_event`, `cancel_processing`, and `embed_selfie` return the
   documented contracts.
3. Deploy the Worker with Convex, R2, Modal, and rate-limit bindings.
4. Deploy the Next.js app with the Worker URL.
5. Run the staging fixture flow before any production cutover.

## Required staging sign-off

Run the real flow:

```text
create event -> signed R2 uploads -> confirm -> Modal accepts job
-> callback batches -> thumbnails and ready state -> selfie match
-> signed gallery -> deletion -> expiry cleanup
```

Confirm organizer authorization, event-filtered vector isolation, duplicate
confirmation/callback idempotency, callback rejection after deletion, signed
assets, retryable R2 cleanup, and the under-five-second selfie-to-gallery
target. Record p50/p95 results in [convex-evaluation.md](convex-evaluation.md).

## Local verification

```bash
pnpm --filter @grabpic/api convex:dev
pnpm --filter @grabpic/api dev
pnpm lint
pnpm build
pnpm vitest run
python -m unittest ml/test_processor.py
python -m compileall ml
```

The deterministic Convex tests run without cloud services. Tests that exercise
the deployed Worker are disabled unless `RUN_REAL_INFRA_TESTS=1` is present.

## Privacy and cleanup

The scheduled Worker marks an event `deleting`, cancels Modal work, removes
all originals/thumbnails from R2, and purges faces, sessions, jobs, photos,
and the event in bounded Convex batches. Failures remain observable and
retryable; the event is deleted last. Delayed callbacks after `deleting` are
rejected and cannot recreate biometric state.
