# GrabPic - Timeline & Milestones

**Version:** 1.0
**Date:** February 9, 2026
**Owner:** Product Engineering
**Status:** Planning Phase

---

## Week 1-2: Foundation (Setup + Core Backend)

**Goals:**
- Project infrastructure ready
- Database schema finalized
- Core API endpoints working

| Day | Tasks | Deliverable | Hours |
|-----|-------|-------------|-------|
| 1-2 | • Setup repo (monorepo: /frontend, /api, /ml)<br>• Configure Turso DB<br>• Setup Cloudflare R2<br>• Create event schema | DB tables created, R2 bucket ready | 8h |
| 3-4 | • Build POST /events endpoint<br>• Implement signed URL generation<br>• Event passcode generation | Event creation working | 10h |
| 5-6 | • Setup Modal.com account<br>• Create stub face detection function<br>• Test face detection on 10 sample photos | Face detection pipeline running | 12h |
| 7 | • Vector search setup (sqlite-vss)<br>• Test embedding storage/retrieval | Vector DB operational | 6h |

**Milestone 1:** Backend can create events, upload photos, detect faces ✅

---

## Week 3-4: ML Pipeline + Matching

**Goals:**
- Face detection at scale
- Clustering working
- Selfie matching functional

| Day | Tasks | Deliverable | Hours |
|-----|-------|-------------|-------|
| 8-9 | • Integrate FaceNet model<br>• Optimize embedding generation<br>• Batch processing for 100+ photos | Process 100 photos in <2min | 10h |
| 10-11 | • Implement DBSCAN clustering<br>• Store cluster IDs in DB<br>• Tune clustering parameters (eps, min_samples) | Face clustering working | 8h |
| 12-13 | • Build POST /match endpoint<br>• Vector similarity search query<br>• Test with real selfies | Matching returns results | 10h |
| 14 | • Optimize query performance<br>• Add result filtering/ranking<br>• Edge case handling (no faces detected) | <500ms match latency | 8h |

**Milestone 2:** Upload photo → take selfie → get matches working end-to-end ✅

---

## Week 5-6: Frontend (Organizer Dashboard)

**Goals:**
- Organizer can create events
- Upload interface working
- Status tracking

| Day | Tasks | Deliverable | Hours |
|-----|-------|-------------|-------|
| 15-16 | • Next.js project setup<br>• Setup shadcn/ui<br>• Create landing page | Basic frontend running | 8h |
| 17-18 | • Build event creation form<br>• Integrate POST /events API<br>• Display passcode + QR code | Event creation UI done | 10h |
| 19-20 | • Drag-and-drop upload (react-dropzone)<br>• Progress bar UI<br>• Call signed URL endpoint | Photo upload working | 12h |
| 21 | • Processing status dashboard<br>• Real-time updates (polling/SSE)<br>• Error handling | Status tracking live | 6h |

**Milestone 3:** Organizer flow complete (create → upload → monitor) ✅

---

## Week 7-8: Frontend (Attendee Experience)

**Goals:**
- Attendee portal polished
- Camera integration smooth
- Gallery experience great

| Day | Tasks | Deliverable | Hours |
|-----|-------|-------------|-------|
| 22-23 | • Build event access page (/e/:passcode)<br>• Passcode validation<br>• Event info display | Access page working | 8h |
| 24-25 | • Camera integration (WebRTC)<br>• Selfie capture UI<br>• Image preprocessing | Camera working | 10h |
| 26-27 | • Gallery grid component<br>• Lightbox view<br>• Image lazy loading | Gallery displays photos | 12h |
| 28 | • Download functionality<br>• Bulk download (zip)<br>• Social share buttons | Download working | 6h |

**Milestone 4:** Attendee flow complete (access → selfie → view → download) ✅

---

## Week 9-10: Polish + Optimization

**Goals:**
- Production-ready performance
- Error handling robust
- Analytics tracking

| Day | Tasks | Deliverable | Hours |
|-----|-------|-------------|-------|
| 29-30 | • Image optimization (thumbnails)<br>• CDN setup<br>• Lazy loading optimization | Fast image loading | 8h |
| 31-32 | • Add loading states everywhere<br>• Error boundaries<br>• User feedback (toasts, modals) | Polished UX | 10h |
| 33-34 | • SEO optimization<br>• OpenGraph tags<br>• Analytics (PostHog/Plausible) | SEO + tracking ready | 8h |
| 35 | • Security audit<br>• Rate limiting<br>• Input validation | Security hardened | 6h |

**Milestone 5:** Production-ready MVP ✅

---

## Week 11-12: Launch Prep + Beta Testing

**Goals:**
- Deploy to production
- Get 10 beta users
- Iterate based on feedback

| Day | Tasks | Deliverable | Hours |
|-----|-------|-------------|-------|
| 36-37 | • Deploy to Vercel (frontend)<br>• Deploy to CF Workers (API)<br>• Setup monitoring (Sentry) | Live in production | 8h |
| 38-39 | • Create landing page<br>• Pricing page (future)<br>• Documentation/FAQ | Marketing site ready | 10h |
| 40-42 | • Recruit 10 beta testers<br>• Support first events<br>• Fix critical bugs | 10 real events processed | 15h |

**Milestone 6:** LAUNCH! 🚀

---

## Total Time Estimate

- **Core Development:** 280 hours (~7 weeks full-time, 12 weeks part-time)
- **Buffer for unknowns:** +30% = 84 hours
- **Total:** ~364 hours (9 weeks full-time, 15 weeks part-time)

**Recommended Schedule:**
- Full-time (40h/week): **9 weeks**
- Part-time (20h/week): **18 weeks** ← Realistic for side project
- Aggressive (60h/week): **6 weeks** ← Burn-out risk