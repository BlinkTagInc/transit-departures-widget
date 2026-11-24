import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { chromium } from 'playwright'

test(
  'a stalled feed body times out and the next refresh uses the latest stop',
  { timeout: 30_000 },
  async (t) => {
    let requests = 0
    let confirmAbort
    const aborted = new Promise((resolve) => {
      confirmAbort = resolve
    })
    const server = createServer((request, response) => {
      if (request.url !== '/feed') {
        response.end(
          `<div id="real_time_departures">
            <form id="stop_form"><input id="departure_stop_code"></form>
          </div>
          <div id="departure_results">
            <button class="departure-results-refresh-button">Refresh</button>
            <span class="departure-results-stop"></span>
            <span class="departure-results-none">No departures</span>
            <span class="departure-results-error">Departures unavailable</span>
          </div>`,
        )
        return
      }
      requests++
      response.writeHead(200, { 'Content-Type': 'application/x-protobuf' })
      if (requests === 1) {
        response.write(Buffer.from([10]))
        response.once('close', confirmAbort)
        return
      }
      response.end()
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(() => {
      server.closeAllConnections()
      server.close()
    })

    const browser = await chromium.launch()
    t.after(() => browser.close())
    const page = await browser.newPage()
    const origin = `http://127.0.0.1:${server.address().port}`
    await page.goto(origin)
    await page.clock.install()
    for (const path of [
      'dist/browser/pbf.js',
      'dist/browser/gtfs-realtime.browser.proto.js',
      'views/widget/js/transit-departures-widget.js',
    ]) {
      const url = origin + '/' + path
      await page.route(url, (route) =>
        route.fulfill({ path, contentType: 'application/javascript' }),
      )
      await page.addScriptTag({ url })
    }
    await page.evaluate(() => {
      const stops = ['A', 'B'].map((id) => ({ stop_id: id, stop_name: id }))
      setupTransitDeparturesWidget([], stops, {
        gtfsRtTripupdatesUrl: location.origin + '/feed',
        refreshIntervalSeconds: 2,
      })
    })
    const firstHeaders = page.waitForResponse(origin + '/feed')
    await page.locator('#departure_stop_code').fill('A')
    await page.locator('#stop_form').dispatchEvent('submit')
    await firstHeaders
    await page.locator('#departure_stop_code').fill('B')
    await page.locator('#stop_form').dispatchEvent('submit')
    await page
      .locator('.departure-results-refresh-button')
      .dispatchEvent('click')
    await page.clock.fastForward(14_000)
    assert.equal(requests, 1)

    await page.clock.fastForward(1000)
    await aborted
    await page.locator('.departure-results-error').waitFor({ state: 'visible' })
    assert.equal(
      await page.locator('.departure-results-stop').textContent(),
      'B',
    )
    const retry = page.waitForResponse(origin + '/feed')
    await page.clock.fastForward(2000)
    await retry
    await page.waitForURL('**/?stop=B')
    assert.equal(requests, 2)
    assert.equal(
      await page.locator('.departure-results-error').isVisible(),
      false,
    )
  },
)
