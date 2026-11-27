const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')

// Run against the static export; API fixtures verify UI behavior without production writes.
async function main() {
  const output = path.resolve('docs/ss')
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  })
  const results = []
  try {
    for (const [viewport, size] of Object.entries({
      desktop: { width: 1440, height: 900 },
      mobile: { width: 390, height: 844 },
    })) {
      const context = await browser.newContext({
        viewport: size,
        permissions: ['camera'],
        reducedMotion: 'reduce',
      })
      await context.route('https://api.grabpic.test/**', (route) => {
        const url = new URL(route.request().url())
        let body =
          url.pathname === '/health/processing'
            ? { status: 'ok', database: 'connected' }
            : { status: 'ok' }
        if (url.pathname === '/events/lookup') body = { eventId: 'qa-event', name: 'QA Event' }
        if (url.pathname.endsWith('/match'))
          body = {
            totalMatches: 2,
            processingTime: 0.1,
            matches: [1, 2].map((i) => ({
              photoId: `qa-${i}`,
              thumbnailUrl: '/qa-photo.svg',
              url: '/qa-photo.svg',
              faces: [],
              width: 400,
              height: 300,
            })),
          }
        return route.fulfill({ json: body, headers: { 'access-control-allow-origin': '*' } })
      })
      await context.route('**/qa-photo.svg', (route) =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e9dcc8"/><text x="40" y="150" font-size="28">UI test fixture</text></svg>',
        }),
      )
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      for (const [name, route, heading] of [
        ['landing', '/', /Somewhere in these photos/],
        ['organizer', '/organizer', 'Create an event'],
        ['attendee', '/attendee', /find your photos/],
        ['status', '/status', 'System Status'],
        ['not-found', '/404.html', /./],
      ]) {
        const response = await page.goto(`http://127.0.0.1:3100${route}`)
        await page.getByRole('heading', { level: 1, name: heading }).waitFor()
        await page.evaluate(() => document.fonts.ready)
        assert.equal(
          await page.locator('a button, button a').count(),
          0,
          'Nested interactive controls',
        )
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
        assert.equal(overflow, false, `${name} overflows on ${viewport}`)
        assert.deepEqual(errors, [], 'Browser runtime errors')
        await page.screenshot({
          path: path.join(output, `${name}-${viewport}.png`),
          fullPage: true,
        })
        results.push({
          page: route,
          viewport,
          http: response.status(),
          horizontalOverflow: overflow,
          runtimeErrors: [...errors],
        })
      }
      if (viewport === 'mobile') {
        await page.goto('http://127.0.0.1:3100/')
        await page.getByRole('button', { name: 'Open menu' }).click()
        assert.equal(
          await page.getByRole('button', { name: 'Close menu' }).getAttribute('aria-expanded'),
          'true',
        )
        await page.getByRole('button', { name: 'Close menu' }).click()
      }
      await page.goto('http://127.0.0.1:3100/attendee')
      await page.getByRole('textbox').fill('123456')
      await page.getByRole('button', { name: /Continue|Join|Find My Photos/ }).click()
      const camera = page.getByRole('button', { name: 'Open Camera' })
      await camera.waitFor()
      assert.equal(await camera.isDisabled(), true, 'Camera must require consent')
      await page.getByRole('checkbox').check()
      assert.equal(await camera.isEnabled(), true)
      await page.screenshot({ path: path.join(output, `consent-${viewport}.png`), fullPage: true })
      await camera.click()
      await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0)
      await page.getByRole('button', { name: 'Capture Selfie' }).click()
      await page.getByRole('button', { name: 'Find My Photos', exact: true }).click()
      const photo = page.getByRole('button', { name: 'Photo 1 from QA Event' })
      await photo.waitFor()
      await page.screenshot({ path: path.join(output, `gallery-${viewport}.png`), fullPage: true })
      await photo.click()
      const dialog = page.getByRole('dialog')
      await dialog.waitFor()
      assert.equal(await dialog.evaluate((el) => el.contains(document.activeElement)), true)
      await page.keyboard.press('Tab')
      assert.equal(await dialog.evaluate((el) => el.contains(document.activeElement)), true)
      await page.screenshot({ path: path.join(output, `lightbox-${viewport}.png`), fullPage: true })
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })
      assert.equal(
        await photo.evaluate((el) => el === document.activeElement),
        true,
        'Return focus to photo',
      )
      assert.deepEqual(errors, [])
      results.push({
        viewport,
        interactions: [
          'consent gate',
          'fake camera capture',
          'mocked matching',
          'gallery',
          'dialog focus',
          'Escape closes',
          'focus restoration',
        ],
        passed: true,
      })
      await context.close()
    }
    await fs.writeFile(
      path.join(output, 'results.json'),
      JSON.stringify(
        {
          testedAt: new Date().toISOString(),
          baseUrl: 'http://127.0.0.1:3100',
          scope:
            'Static production export, mocked API, synthetic camera and gallery fixture. No real inference or infrastructure verification.',
          results,
        },
        null,
        2,
      ) + '\n',
    )
    console.log(JSON.stringify(results, null, 2))
  } finally {
    await browser.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
