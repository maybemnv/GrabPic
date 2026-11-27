# Browser verification

Screenshots show the static production export at 1440 × 900 and 390 × 844 in Playwright Chromium. `results.json` records the run timestamp and assertions.

Coverage: landing, organizer, attendee, status and exported not-found page; attendee consent, synthetic camera capture, mocked matching, gallery and photo dialog. Mobile menu toggling, nested interactive elements, horizontal overflow, runtime errors, dialog focus containment and focus restoration are checked.

The API, gallery image and camera are fixtures. Status badges show mocked healthy responses. The exported `/404.html` is opened directly, so its HTTP 200 does not verify hosting-level 404 routing. Error boundaries are not separate routes and were not forced.

To reproduce without adding dependencies to the app:

```sh
npm install --prefix /tmp/grabpic-browser-qa playwright http-server
/tmp/grabpic-browser-qa/node_modules/.bin/playwright install chromium
NEXT_PUBLIC_API_URL=https://api.grabpic.test pnpm --filter @grabpic/web build
/tmp/grabpic-browser-qa/node_modules/.bin/http-server apps/web/out -p 3100 -e html -c-1
# In another terminal, from the repository root:
NODE_PATH=/tmp/grabpic-browser-qa/node_modules node scripts/browser-qa.cjs
```

No real event, biometric data, upload or inference service is used. These checks do not establish production readiness or selfie latency.
