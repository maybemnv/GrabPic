const { chromium } = require('playwright')
const assert = require('node:assert/strict')

async function main() {
  const browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  })
  let failures = 0
  const cases = {
    async uploads(page) {
      let confirm = 0
      let batch = 0
      let fail = true
      let confirmed
      await page.route('https://api.grabpic.test/**', async (route) => {
        const url = new URL(route.request().url())
        let body = { status: 'processing' }
        if (url.pathname === '/events')
          body = {
            eventId: 'qa',
            passcode: '123456',
            organizerToken: 'fixture',
            shareUrl: 'http://localhost/attendee?invite=qa',
            qrCode: '',
            expiresAt: 1900000000,
          }
        if (url.pathname.endsWith('/upload'))
          ((body = {
            uploadUrls: [1, 2].map((i) => ({
              photoId: `batch-${batch}-${i}`,
              uploadUrl: `https://api.grabpic.test/put/${i}`,
              filename: `${i}.jpg`,
            })),
          }),
            batch++)
        if (url.pathname === '/put/2' && fail)
          return route.fulfill({ status: 503, json: { error: 'fixture failure' } })
        if (url.pathname.endsWith('/confirm')) {
          confirm++
          confirmed = route.request().postDataJSON().photoIds
        }
        return route.fulfill({ json: body })
      })
      await page.goto('http://127.0.0.1:3100/organizer')
      await page.getByLabel('Event Name').fill('Regression event')
      await page.getByLabel('Your Email').fill('qa@example.com')
      await page.getByLabel('Your Name', { exact: true }).fill('QA')
      await page.getByRole('button', { name: 'Create Event', exact: true }).click()
      await page.locator('input[type=file]').setInputFiles(
        [1, 2].map((i) => ({
          name: `${i}.jpg`,
          mimeType: 'image/jpeg',
          buffer: Buffer.from('fixture'),
        })),
      )
      const upload = page.getByRole('button', { name: 'Upload & Process' })
      await upload.click()
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll('button')].find((b) =>
            b.textContent.includes('Upload & Process'),
          )?.disabled,
      )
      assert.equal(confirm, 0, 'A failed PUT must never finalize the batch')
      await upload.click()
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll('button')].find((b) =>
            b.textContent.includes('Upload & Process'),
          )?.disabled,
      )
      assert.equal(confirm, 0, 'Repeated failures must remain retryable without finalization')
      fail = false
      await upload.click()
      await page.waitForFunction(() => document.body.textContent.includes('Processing started'))
      assert.equal(confirm, 1)
      assert.equal(confirmed.length, 2, 'Retry must confirm the full collection')
    },
    async lightbox(page) {
      await page.addInitScript(() => {
        window.dialogCalls = { open: 0, close: 0 }
        for (const [method, key] of [
          ['showModal', 'open'],
          ['close', 'close'],
        ]) {
          const original = HTMLDialogElement.prototype[method]
          HTMLDialogElement.prototype[method] = function (...args) {
            window.dialogCalls[key]++
            return original.apply(this, args)
          }
        }
      })
      await page.route('https://api.grabpic.test/**', (route) =>
        route.fulfill({
          json: route.request().url().endsWith('/match')
            ? {
                totalMatches: 3,
                matches: [1, 2, 3].map((i) => ({
                  photoId: `${i}`,
                  thumbnailUrl: '/favicon.ico',
                  url: '/favicon.ico',
                })),
              }
            : { eventId: 'qa', name: 'QA Event' },
        }),
      )
      await page.goto('http://127.0.0.1:3100/attendee')
      await page.getByRole('textbox').fill('123456')
      await page.getByRole('button', { name: /Continue|Join|Find My Photos/ }).click()
      await page.getByRole('checkbox').check()
      await page.getByRole('button', { name: 'Open Camera' }).click()
      await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0)
      await page.getByRole('button', { name: 'Capture Selfie' }).click()
      await page.getByRole('button', { name: 'Find My Photos', exact: true }).click()
      await page.getByRole('button', { name: 'Photo 1 from QA Event' }).click()
      const dialog = page.getByRole('dialog')
      await dialog.waitFor()
      for (const [key, number] of [
        ['ArrowRight', 2],
        ['ArrowRight', 3],
        ['ArrowLeft', 2],
        ['ArrowLeft', 1],
      ]) {
        await page.keyboard.press(key)
        await dialog.getByRole('img', { name: `Photo ${number} from QA Event` }).waitFor()
        assert.equal(
          await dialog.evaluate((el) => el.open && el.contains(document.activeElement)),
          true,
        )
        assert.deepEqual(
          await page.evaluate(() => window.dialogCalls),
          { open: 1, close: 0 },
          'Navigation must not close and reopen dialog',
        )
      }
    },
    async status(page) {
      await page.route('https://api.grabpic.test/**', (route) => {
        const pathname = new URL(route.request().url()).pathname
        return route.fulfill({
          status: pathname.startsWith('/health') ? 200 : 404,
          json:
            pathname === '/health/processing'
              ? { status: 'ok', database: 'connected' }
              : { status: 'ok' },
        })
      })
      await page.goto('http://127.0.0.1:3100/status')
      await page.getByText(/Last checked/).waitFor()
      assert.equal(
        await page.getByText('Operational', { exact: true }).count(),
        2,
        'API and Convex endpoints must be healthy',
      )
      await page.getByText('ML Processor', { exact: true }).waitFor()
      await page.getByText('Unverified', { exact: true }).waitFor()
      await page.route('https://api.grabpic.test/health/processing', (route) =>
        route.fulfill({ status: 503, json: { status: 'error', database: 'disconnected' } }),
      )
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      await page.getByText('Down', { exact: true }).waitFor()
      assert.equal(await page.getByText('Operational', { exact: true }).count(), 1)
      await page.getByText('Unverified', { exact: true }).waitFor()
    },
  }
  try {
    for (const [name, run] of Object.entries(cases)) {
      const context = await browser.newContext({ permissions: ['camera'] })
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      try {
        await run(page)
        console.log(`PASS ${name}`)
      } catch (e) {
        failures++
        console.error(`FAIL ${name}: ${e.message}`)
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
  assert.equal(failures, 0, `${failures} review regressions failed`)
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
