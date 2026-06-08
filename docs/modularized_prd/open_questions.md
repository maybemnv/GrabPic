# FaceFind - Open Questions (To Resolve in Week 1)

**Version:** 1.0
**Date:** February 9, 2026
**Owner:** Product Engineering
**Status:** Planning Phase

---

## Technical
1. **Client-side vs. server-side embedding for selfies?**
   - Option A: ONNX.js in browser ($0 cost, privacy-friendly)
   - Option B: Server endpoint (consistent quality, easier debugging)
   - **Decision:** Start with server, add client option in Phase 2

2. **Clustering algorithm parameters?**
   - DBSCAN eps: 0.3-0.5? (test on real data)
   - Min samples: 2 or 3?
   - **Decision:** A/B test, let users adjust threshold

3. **Thumbnail sizes?**
   - 200px (grid) + 800px (preview) enough?
   - **Decision:** Yes, add 1600px for download in Phase 2

## Product
1. **Should free tier have watermarks?**
   - Pro: Incentive to upgrade
   - Con: Poor UX, might hurt growth
   - **Decision:** No watermark, limit to 100 photos instead

2. **Manual face tagging fallback?**
   - If ML fails, let user manually select photos?
   - **Decision:** Phase 2 feature, focus on ML quality first