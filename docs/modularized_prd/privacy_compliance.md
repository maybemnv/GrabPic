# FaceFind - Privacy & Compliance

**Version:** 1.0
**Date:** February 9, 2026
**Owner:** Product Engineering
**Status:** Planning Phase

---

## GDPR Compliance
- [ ] **Right to access:** Export all user data
- [ ] **Right to deletion:** One-click event deletion
- [ ] **Data minimization:** Only store necessary face embeddings
- [ ] **Purpose limitation:** Clear ToS on face data usage
- [ ] **Storage limitation:** Auto-delete after 30 days

## BIPA Compliance (Illinois)
- [ ] **Written consent:** Checkbox before selfie capture
- [ ] **Retention policy:** Clearly stated 30-day limit
- [ ] **No selling data:** Never share embeddings with 3rd parties

## Implementation
```typescript
// Consent flow
const ConsentModal = () => (
  <Modal>
    <h2>Privacy Notice</h2>
    <p>We'll analyze your selfie to find your photos.
       Your face data is:</p>
    <ul>
      <li>Used only for this event</li>
      <li>Deleted after 30 days</li>
      <li>Never shared with anyone</li>
    </ul>
    <Checkbox required>
      I consent to facial recognition for this event
    </Checkbox>
  </Modal>
)
```