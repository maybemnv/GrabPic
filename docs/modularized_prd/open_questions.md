# GrabPic - Open Questions (Resolved)

**Status:** All questions resolved. This file exists as record of decisions made during Week 1 planning.

---

## Technical

1. **Client-side vs. server-side embedding for selfies?**
   - **Resolution:** Server-side (ArcFace via Modal webhook). Client ONNX deferred to Phase 2.

2. **Clustering algorithm parameters?**
   - **Resolution:** DBSCAN eps=0.4 (default), min_samples=2. Stored as tunable per-event config.

3. **Thumbnail sizes?**
   - **Resolution:** 200px (grid) + 800px (preview). 1600px deferred to Phase 2.

## Product

1. **Should free tier have watermarks?**
   - **Resolution:** No watermark. Free tier capped at 100 photos instead.

2. **Manual face tagging fallback?**
   - **Resolution:** Phase 2 feature. Focus on ML quality first.
