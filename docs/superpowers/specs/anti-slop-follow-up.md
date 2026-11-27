# Redesign source audit — 28 November 2026

Scope: PR #15, photographic journal redesign. This is a source review, not a visual sign-off.

## Findings addressed

1. Empty photo frames presented a gallery without photographs. Removed the placeholders and their unused component; the hero now explains the attendee and organizer paths.
2. Experience cards repeated the numbered workflow. Removed the duplicate section and ML implementation language from customer copy.
3. Matching copy promised every appearance. Changed it to matching results with a photo-quality limitation. Retention copy states the policy without claiming deployed deletion has been verified.
4. Landing links contained buttons. Replaced nested interactive elements with styled links.
5. The custom photo overlay did not contain keyboard focus. Switched to the browser dialog primitive for modal focus handling.
6. Scroll reveals hid useful content and ignored reduced-motion preferences in JavaScript animation. Removed the effects; content renders immediately.
7. Removed unused PhotoFrame, SectionHeading and FormField components and unused imports.

## Validation and limits

Workspace TypeScript checks pass. Vitest reports 107 passing tests and 16 skipped infrastructure tests. The API tests do not validate visual appearance; the separate Playwright runner checks dialog keyboard behavior. Playwright Chromium now checks all five exported pages at desktop and mobile sizes, plus consent, synthetic capture, mocked gallery and dialog focus restoration. Screenshots and results are in docs/ss. Real upload/inference flows still require verification. The web build reports the existing missing-ESLint warning.

## Integration order

Keep #15 in draft until #12 and #13 have both merged into master. Order: #12, #13, then #15. Both earlier branches touch the organizer page and API client; update from master and reconcile these flows before marking #15 ready. No merge or auto-merge was requested.

## PR review fixes

PR #15 is stacked on #13 (`fix/durable-processing-recovery`), which is based on #12. #14 was requested as the stack tip, but GitHub returns 404 for that number; its URL or corrected number remains needed. Do not merge #15 before its prerequisites.

Partial upload failures now stop before confirmation; Retry uploads the complete selected collection with fresh signed URLs. Unconfirmed objects from abandoned attempts remain covered by the existing orphan cleanup. A new regression reproduces repeated PUT failure followed by a full successful retry. Dialog lifecycle now depends only on open state, with keyboard listeners updated separately; arrow tests count showModal/close calls. Status uses /health and /health/processing, labels the latter Convex, and reports ML readiness as unverified.

Verification: all three regressions failed before fixes and pass afterward; desktop/mobile browser smoke passes; 124 Vitest tests and 30 Python tests pass. Infrastructure tests remain opt-in. Build, workspace type checks, Worker dry-run and Pages function compilation pass. The existing missing-ESLint build warning remains. Real inference and latency remain unverified.
