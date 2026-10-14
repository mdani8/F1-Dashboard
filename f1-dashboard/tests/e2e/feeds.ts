import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createFeedService } from '../../src/server/features/feeds/feed-service.js';
import { createServer } from '../../src/server/http/server.js';
import { classification, fixtureNow, races } from '../fixtures/providers.js';
import { createPage, launchBrowser } from '../support/browser.js';
import { createMemoryFeedStore } from '../support/feed-store.js';
import { createFixtureService } from '../support/fixture-service.js';
import { listen } from '../support/http.js';
import { artifactPath } from '../support/paths.js';

const { service } = createFixtureService({
  now: () => fixtureNow,
  override: (url) => {
    if (url.pathname.endsWith('/2026/1/results/'))
      return new Response(
        JSON.stringify({
          MRData: {
            RaceTable: {
              season: '2026',
              Races: [
                {
                  ...races[0],
                  Results: classification.map((row, index) =>
                    index
                      ? row
                      : { ...row, Driver: { ...row.Driver, givenName: 'Max & <b>TEST</b>' } },
                  ),
                },
              ],
            },
          },
        }),
      );
  },
});
const server = createServer({
  service,
  feeds: { snapshot: (kind) => feeds.snapshot(kind), status: () => feeds.status() },
});
const base = await listen(server);
const feeds = createFeedService({
  service,
  store: createMemoryFeedStore(),
  publicBaseUrl: base,
  now: () => fixtureNow,
  logger: { error() {}, warn() {} },
});
await feeds.refresh();
const browser = await launchBrowser();
const page = await createPage(browser, {
  viewport: { width: 1440, height: 1000 },
  timezoneId: 'Europe/Brussels',
});
const errors: string[] = [],
  checks: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('#dashboard-view')?.dataset.pageMotion === 'settled',
  );
  assert.equal(
    await page.locator('head link[rel="alternate"][type="application/rss+xml"]').count(),
    3,
  );
  assert.equal(
    await page.getByRole('navigation', { name: 'RSS subscriptions' }).getByRole('link').count(),
    3,
  );
  checks.push('feed discovery and subscription links exist on the dashboard');
  const parsed = await page.evaluate(async () => {
    const feeds = [];
    for (const kind of ['all', 'results', 'upcoming']) {
      const response = await fetch(`/feeds/${kind}.xml`),
        text = await response.text();
      const document = new DOMParser().parseFromString(text, 'application/xml');
      const entries = [...document.querySelectorAll<HTMLElement>('item')];
      const result = entries.find((item) =>
        item.querySelector<HTMLElement>('guid')!.textContent.includes(':2026:1:race:'),
      );
      const html = result
        ? new DOMParser().parseFromString(
            result.querySelector<HTMLElement>('description')!.textContent,
            'text/html',
          )
        : null;
      feeds.push({
        kind,
        status: response.status,
        parserErrors: document.querySelectorAll<HTMLElement>('parsererror').length,
        items: entries.length,
        link: result?.querySelector<HTMLElement>('link')!.textContent,
        rows: html?.querySelectorAll<HTMLElement>('tbody tr').length,
        unsafe: html?.querySelectorAll<HTMLElement>('script,b').length,
        driver: html?.querySelector<HTMLElement>('tbody tr td:nth-child(2)')!.textContent,
        missingPoints: html?.body.textContent.includes('Awaiting publication'),
      });
    }
    return feeds;
  });
  assert.ok(parsed.every((feed) => feed.status === 200 && feed.parserErrors === 0));
  assert.equal(parsed.find((feed) => feed.kind === 'results')!.rows, 3);
  assert.equal(parsed[0]!.unsafe, 0);
  assert.equal(parsed[0]!.driver, 'Max & <b>TEST</b> Verstappen');
  assert.equal(parsed[0]!.missingPoints, true);
  checks.push(
    'all feeds parse as XML and escaped classifications retain full rows without injecting markup',
  );
  await page.goto(parsed[0]!.link!, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      document.querySelectorAll<HTMLElement>('.results-panel tbody tr').length === 3 &&
      document.querySelector<HTMLElement>('#weekend-view')?.dataset.pageMotion === 'settled',
  );
  assert.equal(await page.locator('[data-session="race"]').getAttribute('aria-selected'), 'true');
  assert.equal(
    await page.getByRole('navigation', { name: 'RSS subscriptions' }).getByRole('link').count(),
    3,
  );
  checks.push(
    'RSS links open the correct shareable session and subscriptions remain available on weekend pages',
  );
  await page.locator('footer').scrollIntoViewIfNeeded();
  await page.locator('footer').screenshot({ path: artifactPath('rss-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('footer').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page
    .getByRole('navigation', { name: 'RSS subscriptions' })
    .getByRole('link', { name: 'Results', exact: true })
    .press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement!.textContent), '24-hour reminders');
  await page.locator('footer').screenshot({ path: artifactPath('rss-mobile.png') });
  checks.push(
    'desktop/mobile subscription controls wrap correctly and support keyboard navigation',
  );
  assert.deepEqual(errors, []);
  const report = { fixtureBased: true, checks, feeds: parsed, runtimeErrors: errors };
  await writeFile(artifactPath('rss-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await feeds.stop();
  await browser.close();
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
}
