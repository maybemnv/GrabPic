# Turso Baseline vs Convex

This document records the evidence used to decide whether the Convex refactor
should ship. Measurements must use the same deterministic fixtures and deployed
path for both backends.

## Turso baseline

- Baseline commit: `be3a7c5f758f35fb2a581ac3bcc47fa3be66285d`
- Refactor branch starting commit: `1b634e4ba7477d3f86ce714d131e6fa156000bf7`
- Public boundary: Cloudflare Worker with Hono
- Application database: Turso/libSQL
- Asset storage: Cloudflare R2
- ML runtime: Modal
- Embedding model: `facenet-pytorch` 2.6.0,
  `InceptionResnetV1(pretrained="vggface2")`, 512 dimensions
- Detection threshold: 0.9
- Clustering: DBSCAN cosine distance, `eps=0.4`, `min_samples=2`
- Backend source LOC: Worker 1,318; database package 169; ML 285
- Deterministic match fixture: `tests/08-matching.test.ts`
- Configured Turso data: three disposable test events and no photos, faces,
  embeddings, or match sessions; no importer is required

### Local validation

- `pnpm turbo lint --force`: passed
- `pnpm turbo build --force`: passed; Next.js reports the existing missing
  ESLint dependency warning
- `pnpm vitest run`: 36 passed and 16 infrastructure tests failed because
  `API_BASE_URL` points to an inactive `localhost:8787`
- `python -m unittest ml/test_processor.py`: four passed
- `python -m py_compile ml/processor.py ml/test_processor.py`: passed

### Deployed measurements

The local environment does not contain Worker, R2, or Modal credentials, so it
cannot reproduce the signed-off deployed path. Before cutover acceptance,
record the Turso and Convex results for:

| Measurement | Turso | Convex | Acceptance |
| --- | ---: | ---: | --- |
| Event creation p50/p95 | pending | pending | Convex p95 no more than 10% slower |
| Status update p50/p95 | pending | pending | Record comparison |
| Invite lookup p50/p95 | pending | pending | Record comparison |
| Match endpoint p50/p95 | pending | pending | Convex p95 no more than 10% slower |
| Warm selfie-to-gallery p50/p95 | pending | pending | p95 under 5 seconds |
| Cold selfie-to-gallery p50/p95 | pending | pending | p95 under 5 seconds |
| Deletion duration | pending | pending | Complete cleanup |
| Expiry duration | pending | pending | Complete cleanup |

## Convex result

Complete this section only after the staged Convex E2E path runs against the
same fixture manifest.

| Area | Turso | Convex |
| --- | --- | --- |
| Architecture | Worker, Turso, R2, Modal | pending |
| Runtime services | Turso, R2, Modal, Worker | pending |
| Backend LOC | 1,772 | pending |
| Matching latency | pending | pending |
| E2E latency | pending | pending |
| State-management complexity | SQL migrations and application scan | pending |
| Deployment requirements | Turso migration, Worker, Modal, R2 | pending |
| Estimated operating implications | pending | pending |
| Remaining risks | Application scan scaling | pending |

## Recommendation

Pending Convex staging validation, including the 256-candidate vector-search
limit, retryable deletion, and the five-second North Star.
