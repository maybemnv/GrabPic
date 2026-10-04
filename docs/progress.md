### GrabPic

- [ ] Validate market first
- [ ] Talk to organizers
- [ ] Talk to photographers
- [ ] Talk to attendees

**Product**
- [x] MVP architecture
- [x] Monorepo setup (pnpm, Turborepo, shared packages)
- [x] Landing page (cinematic dark theme)
- [x] Organizer dashboard (create event, upload, poll status)
- [x] Attendee portal (code entry, selfie capture, gallery)
- [x] Edge API (Cloudflare Workers + Hono, all routes)
- [x] ML pipeline (OCI CPU service: MTCNN + FaceNet vggface2 + DBSCAN)
- [x] Test suite (Convex contract tests plus opt-in infrastructure suites)
- [x] Monitoring (Sentry, PostHog, structured logging)
- [x] Error boundary pages (404, error, global-error)
- [x] QR code generation + redirect
- [x] Documentation (deployment guide, API examples, todo)

**Infrastructure (not yet provisioned)**
- [x] Convex schema and functions
- [ ] Cloudflare R2 bucket
- [ ] API Worker and Queue deployed
- [ ] OCI processor deployed and measured
- [ ] Cloudflare Pages frontend deployed

- [ ] Run deployed Convex/R2/OCI validation, including 1 GB peak RSS and p95 latency
