# GrabPic - Deployment Checklist

**Version:** 1.0
**Date:** February 9, 2026
**Owner:** Product Engineering
**Status:** Planning Phase

---

## Pre-Launch (Week 11)
- [ ] Setup custom domain (GrabPic.app)
- [ ] Configure DNS (Cloudflare)
- [ ] SSL certificates (auto via CF)
- [ ] Environment variables in Vercel
- [ ] Environment variables in Wrangler
- [ ] Sentry error tracking
- [ ] PostHog analytics
- [ ] Setup status page (status.GrabPic.app)

## Launch Day (Week 12)
- [ ] Deploy frontend to Vercel
- [ ] Deploy API to CF Workers
- [ ] Deploy ML functions to Modal
- [ ] Smoke test full flow (create → upload → match)
- [ ] Share on Twitter, LinkedIn
- [ ] Post to r/SideProject, HN Show
- [ ] Email 10 beta testers

## Post-Launch (Week 13+)
- [ ] Monitor error rates (Sentry)
- [ ] Monitor costs (AWS/CF dashboards)
- [ ] User feedback collection (Typeform)
- [ ] Weekly bug fixes
- [ ] Monthly feature releases