# Release Blockers — Tracking

Branch: `fix-release-blocker`
Status: code-level blocker and review-fix work complete; external integration is unverified.

## P0 Blockers

- [x] **Real selfie matching** — Modal now generates the attendee embedding with the same `InceptionResnetV1(pretrained="vggface2")` model used for batch processing. The Worker decodes event-scoped 512-dimensional embeddings, computes normalized dot-product similarity, applies server-side `MATCH_THRESHOLD`, handles malformed service responses, and deduplicates by photo.
- [x] **Worker ↔ Modal contract** — upload confirmation sends `{ event_id, photos: [{ photo_id, r2_key }] }`; Modal validates event-scoped keys and reads originals directly from R2 using Modal secrets.
- [x] **Match result asset delivery** — successful matches return five-minute SigV4-presigned original and 800px thumbnail URLs. Placeholder `/api/photos/...` and `/api/thumbs/...` values are gone.
- [x] **Thumbnail generation** — Modal writes deterministic 200px and 800px thumbnails and persists both keys. Existing deletion and expiry cleanup remove originals, thumbnails, faces, embeddings, and match sessions.
- [x] **Share / QR onboarding** — events now have a cryptographically random opaque invite token. Share links and QR codes use `/e/<inviteToken>`; manual attendees use the six-digit code, and event ID entry is removed.
- [x] **Abuse protection for controlled/private pilot** — Cloudflare Rate Limiting covers event creation, lookup, upload initiation/confirmation, and match requests. Organizer routes require a one-time high-entropy management token; only its hash is stored. Uploads validate event existence, use a client-global bucket, bind declared content length in the signed PUT, and verify actual R2 size before processing.

## Verification Status

Review fixes: organizer management routes require a one-time high-entropy bearer token whose SHA-256 hash is stored; public attendee lookup remains sanitized. Uploads validate the event before signing, use a client-global rate-limit bucket, bind declared content length, and verify actual R2 size before persistence. Passcodes are CSPRNG-generated and unique while retained. Convex mutations make upload confirmation and processing readiness atomic.

- Code-level: completed and covered by focused TypeScript and Python tests.
- Local static validation: lint, build, full Vitest suite, Python unit tests, and Python compilation are run before commit. Infrastructure tests are explicitly opt-in with `RUN_REAL_INFRA_TESTS=1`.
- External integration: not verified in this environment. The local environment has no usable Modal/Cloudflare deployment credentials.
- Production status: not claimed. Deploy Convex/R2/Modal/Worker/frontend and run the end-to-end smoke flow. Full organizer identity, recovery, and open public multi-tenant authorization remain prerequisites.
