# FaceFind - Risk Mitigation

**Version:** 1.0
**Date:** February 9, 2026
**Owner:** Product Engineering
**Status:** Planning Phase

---

## Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Face detection fails on diverse faces | Medium | High | Test on diverse dataset (age, ethnicity, lighting), use pre-trained VGGFace2 model |
| Vector search too slow | Low | High | Pre-compute clusters, use indexed search, cache common queries |
| R2/Modal downtime | Low | Medium | Graceful degradation, retry logic, status page |
| GPU costs exceed budget | Medium | Medium | Set hard limits in Modal, optimize batch sizes, monitor closely |
| Privacy compliance issues | Medium | Critical | Auto-delete after 30 days, no permanent storage, clear ToS |

## Product Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Low organizer adoption | High | Critical | Target early adopters (college clubs, corporate teams), make onboarding dead simple |
| Poor match quality → low trust | Medium | High | Set conservative threshold (0.6), show confidence scores, allow manual search |
| Competitors (Google Photos) | Low | Medium | Focus on event-specific use case, faster than Google's sharing |
| Legal issues (BIPA, GDPR) | Low | Critical | Consult lawyer before launch, implement data controls |

## Execution Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Scope creep | High | Medium | Stick to MVP features, park nice-to-haves in backlog |
| Burnout | Medium | High | Cap hours at 25/week, take weekends off, celebrate milestones |
| Analysis paralysis | Medium | Medium | Use this PRD as contract, timebox decisions to 1 hour max |
| Loss of motivation | Medium | High | Share progress publicly (Twitter, blog), recruit beta testers early |