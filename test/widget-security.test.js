import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromium } from 'playwright'
import pug from 'pug'
import { format } from 'prettier'
import { PbfWriter } from 'pbf'
import realtime from 'gtfs-realtime-pbf-js-module'
import generate from '../dist/index.js'

const feedUrl = "https://widget.test/O'Brien?agency=one&agency=two"
const agency = { agency_key: 'test', gtfs_rt_tripupdates_url: feedUrl }

test('reject invalid widget settings before opening the GTFS source', async () => {
  for (const interval of [0, -1, 1.5, '20', 2147484]) {
    await assert.rejects(
      generate({ agency, refreshIntervalSeconds: interval }),
      /refreshIntervalSeconds/,
    )
  }
  await assert.rejects(generate({ agency, timeFormat: 'other' }), /timeFormat/)
  for (const url of ['', '/relative', 'ftp://widget.test/feed']) {
    await assert.rejects(
      generate({ agency: { ...agency, gtfs_rt_tripupdates_url: url } }),
      /absolute HTTP/,
    )
  }
})

test('render feed and translation text literally in full-page and headless embeds', async (t) => {
  const browser = await chromium.launch()
  t.after(() => browser.close())
  const name = 'Main <em>Street</em> & First'
  const code = '<b>A</b>'
  const label = '<i>min</i>'
  const direction = {
    direction_id: 0,
    direction: 'East',
    tripIds: ['T'],
    stopIds: ['S'],
  }
  const routes = {
    fields: ['route_id', 'route_full_name', 'directions'],
    rows: [['R', 'Route', [direction]]],
  }
  const stops = {
    fields: ['stop_id', 'stop_name', 'stop_code'],
    rows: [['S', name, code]],
  }

  for (const noHead of [false, true]) {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const config = {
      agency,
      assetPath: '/',
      refreshIntervalSeconds: 20,
      timeFormat: '24hour',
    }
    let html = pug.renderFile(
      `views/widget/${noHead ? 'widget' : 'widget_full'}.pug`,
      {
        config,
        __: (key) => (key === 'min' ? label : key),
      },
    )
    if (noHead) {
      const scripts = [
        'pbf.js',
        'gtfs-realtime.browser.proto.js',
        'accessible-autocomplete.min.js',
        'transit-departures-widget.js',
      ]
      html += scripts
        .map((file) => `<script src="/js/${file}"></script>`)
        .join('')
    } else {
      html = await format(html, {
        parser: 'html',
        htmlWhitespaceSensitivity: 'strict',
      })
    }

    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname === '/') {
        return route.fulfill({
          contentType: 'text/html',
          body: html,
          headers: { 'Content-Security-Policy': "script-src 'self'" },
        })
      }
      if (
        url.pathname === '/data/routes.json' ||
        url.pathname === '/data/stops.json'
      ) {
        return route.fulfill({
          json: url.pathname.endsWith('routes.json') ? routes : stops,
        })
      }
      if (url.pathname === "/O'Brien") {
        assert.equal(url.href, new URL(feedUrl).href)
        const writer = new PbfWriter()
        realtime.FeedMessage.write(
          {
            entity: [
              {
                trip_update: {
                  trip: { trip_id: 'T' },
                  stop_time_update: [
                    {
                      stop_id: 'S',
                      stop_sequence: 1,
                      departure: { time: Math.floor(Date.now() / 1000) + 30 },
                    },
                    { stop_id: 'end', stop_sequence: 2 },
                  ],
                },
              },
            ],
          },
          writer,
        )
        return route.fulfill({ body: Buffer.from(writer.finish()) })
      }
      const file = url.pathname.split('/').pop()
      const folder = file.startsWith('transit-departures-widget')
        ? `views/widget/${url.pathname.split('/')[1]}`
        : 'dist/browser'
      return route.fulfill({ path: `${folder}/${file}` })
    })

    await page.goto('https://widget.test/')
    assert.equal(await page.locator('script:not([src])').count(), 0)
    assert.equal(
      await page
        .locator('#real_time_departures')
        .getAttribute('data-gtfs-rt-tripupdates-url'),
      feedUrl,
    )
    await page.locator('#departure_stop_code').fill('Main')
    const suggestion = page.locator('.autocomplete__option').first()
    assert.equal(await suggestion.locator('strong').textContent(), name)
    assert.ok((await suggestion.textContent()).includes(code))
    assert.equal(await suggestion.locator('b, em').count(), 0)
    await suggestion.click()
    const time = page.locator('.departure-result-time').first()
    assert.equal(await time.textContent(), '<1' + label)
    assert.equal(await time.locator('i').count(), 0)
    assert.deepEqual(errors, [])
    await page.close()
  }
})
