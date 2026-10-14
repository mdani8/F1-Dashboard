import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import type { Route as PlaywrightRoute } from 'playwright';
import { createServer } from '../../src/server/http/server.js';
import { fixtureNow } from '../fixtures/providers.js';
import { createPage, launchBrowser, waitForApp } from '../support/browser.js';
import { createFixtureService } from '../support/fixture-service.js';
import { listen } from '../support/http.js';
import { artifactPath } from '../support/paths.js';

let now = fixtureNow,
  published = true,
  failPits = false;
const { fixture, service } = createFixtureService({
  now: () => now,
  override: (url) => {
    if (url.pathname.endsWith('/session_result') && !published) return new Response('[]');
    if (url.pathname.endsWith('/pit') && failPits) return new Response('{}', { status: 503 });
  },
});
const server = createServer({ service });
const url = (await listen(server)) + '/';
const browser = await launchBrowser();
const page = await createPage(browser, {
  viewport: { width: 1440, height: 1000 },
  timezoneId: 'Europe/Brussels',
});
await page.clock.install({ time: new Date(now) });
const errors: string[] = [],
  requests: string[] = [],
  checks: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (request.url().includes('/api/weekends/')) requests.push(request.url());
});
await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
const ready = () => waitForApp(page, true);
const resultsReady = async () => {
  await ready();
  await page.waitForFunction(
    () =>
      document.querySelectorAll<HTMLElement>('#weekend-view .results-panel tbody tr').length > 0,
  );
};
async function goto(hash: string) {
  await page.goto(url + hash, { waitUntil: 'domcontentloaded' });
  await ready();
}
try {
  await goto('');
  assert.equal(await page.locator('#drivers-panel tbody tr').count(), 3);
  await page.getByRole('tab', { name: 'Constructors', exact: true }).click();
  assert.equal(await page.locator('#constructors-panel tbody tr').count(), 3);
  await page.getByRole('tab', { name: 'Constructors', exact: true }).press('ArrowLeft');
  assert.equal(
    await page.getByRole('tab', { name: 'Drivers', exact: true }).getAttribute('aria-selected'),
    'true',
  );
  const schedule = page.getByRole('button', {
    name: 'Australian Grand Prix schedule',
    exact: true,
  });
  await schedule.focus();
  await schedule.press('Enter');
  assert.equal(await schedule.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#schedule-2026-1 li').count(), 5);
  await page.screenshot({ path: artifactPath('desktop.png'), fullPage: true });
  checks.push('dashboard standings and separate keyboard schedule toggle');

  await page.getByRole('link', { name: 'Australian Grand Prix results', exact: true }).click();
  await resultsReady();
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('#circuit-map')?.dataset.mapStatus === 'available',
  );
  assert.equal(await page.locator('#circuit-map svg [data-sector]').count(), 3);
  await page.getByRole('button', { name: /Sector 2/ }).click();
  assert.equal(
    await page.getByRole('button', { name: /Sector 2/ }).getAttribute('aria-pressed'),
    'true',
  );
  await page.evaluate(() => {
    window.originalMap = document.querySelector<HTMLElement>('#circuit-map svg');
  });
  assert.equal(await page.locator('#weekend-title').innerText(), 'Australian Grand Prix');
  assert.equal(await page.locator('[data-session="race"]').getAttribute('aria-selected'), 'true');
  assert.match(await page.locator('.results-panel').innerText(), /25/);
  assert.match(await page.locator('.results-panel').innerText(), /Awaiting publication/);
  await page.locator('[data-session="practice-1"]').click();
  await resultsReady();
  assert.match(await page.locator('.results-panel').innerText(), /1:20.123/);
  assert.match(await page.locator('.points-note').innerText(), /No points awarded/);
  await page.locator('[data-session="qualifying"]').click();
  await resultsReady();
  assert.match(await page.locator('.results-panel').innerText(), /Q1/);
  await page.locator('[data-session="qualifying"]').press('ArrowRight');
  await resultsReady();
  assert.equal(
    await page.evaluate(() => (document.activeElement as HTMLElement).dataset.session),
    'race',
  );
  await page.locator('.results-panel .driver-link').first().click();
  await ready();
  await page.waitForFunction(
    () => document.querySelectorAll<HTMLElement>('.lap-table tbody tr').length === 3,
  );
  assert.match(page.url(), /session=race&driver=1/);
  assert.match(await page.locator('.lap-panel').innerText(), /Out lap/);
  assert.match(await page.locator('.lap-panel').innerText(), /HARD/);
  assert.equal(
    await page.evaluate(
      () => originalMap === document.querySelector<HTMLElement>('#circuit-map svg'),
    ),
    true,
  );
  assert.equal(
    await page.getByRole('button', { name: /Sector 2/ }).getAttribute('aria-pressed'),
    'true',
  );
  await page.getByRole('button', { name: /Sector 2/ }).focus();
  await page.getByRole('button', { name: /Sector 2/ }).press('Space');
  assert.equal(
    await page.getByRole('button', { name: /Sector 2/ }).getAttribute('aria-pressed'),
    'false',
  );
  checks.push(
    'track map shows three sectors, supports keyboard highlighting and stays mounted across session/driver changes',
  );
  await page.goBack();
  await ready();
  assert.match(await page.locator('.lap-panel').innerText(), /Select a driver/);
  await page.goForward();
  await ready();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  assert.equal(await page.locator('.lap-table tbody tr').count(), 3);
  await page.screenshot({ path: artifactPath('weekend-desktop.png'), fullPage: true });
  checks.push(
    'weekend and session navigation, qualifying phases, driver laps, direct reload and browser history',
  );

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: artifactPath('weekend-mobile.png'), fullPage: true });
  await page.getByRole('link', { name: 'Race calendar', exact: true }).click();
  await ready();
  await page.screenshot({ path: artifactPath('mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  checks.push('mobile dashboard and weekend pages without page overflow');

  published = false;
  await goto('#/weekend/2026/2?session=practice-1');
  assert.match(await page.locator('.results-panel').innerText(), /awaiting publication/);
  assert.equal(await page.locator('[data-session]').count(), 5);
  published = true;
  now += 60001;
  await page.clock.fastForward(60001);
  await resultsReady();
  assert.equal(await page.locator('.results-panel tbody tr').count(), 3);
  checks.push('automatic transition from awaiting publication to results');

  await page.locator('#lap-driver').focus();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#results-scroll')!.scrollLeft = 170;
  });
  const before = await page.evaluate(() => ({
    scroll: scrollY,
    left: document.querySelector<HTMLElement>('#results-scroll')!.scrollLeft,
  }));
  now += 60001;
  await page.clock.fastForward(60001);
  await ready();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'lap-driver');
  const after = await page.evaluate(() => ({
    scroll: scrollY,
    left: document.querySelector<HTMLElement>('#results-scroll')!.scrollLeft,
  }));
  assert.ok(Math.abs(before.scroll - after.scroll) <= 1, JSON.stringify({ before, after }));
  assert.equal(before.left, after.left);
  checks.push('focus and horizontal/vertical scroll preserved on refresh');

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenCount = requests.length;
  now += 61000;
  await page.clock.fastForward(61000);
  assert.equal(requests.length, hiddenCount);
  const resumedRequest = page.waitForRequest((request) => request.url().includes('/api/weekends/'));
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await resumedRequest;
  await ready();
  assert.ok(requests.length > hiddenCount);
  checks.push('polling pauses in hidden tabs and refreshes on return');

  failPits = true;
  now += 2000;
  await page.clock.fastForward(2000);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await ready();
  assert.match(
    await page.locator('.strategy-grid section').first().innerText(),
    /previously retrieved/,
  );
  assert.equal(await page.locator('.results-panel .notice').count(), 0);
  assert.equal(await page.locator('.strategy-grid section').last().locator('.notice').count(), 0);
  checks.push('independent stale pit data while classification and tires remain fresh');

  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('#circuit-map')?.dataset.mapStatus === 'available',
  );
  await page.route('**/api/weekends/2026/2/track?refresh=1', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Map unavailable.' }),
    }),
  );
  await page.getByRole('button', { name: 'Refresh track map', exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector<HTMLElement>('#circuit-map .notice')
      ?.textContent.includes('previously retrieved'),
  );
  assert.equal(await page.locator('#circuit-map svg [data-sector]').count(), 3);
  assert.equal(await page.locator('.results-panel .notice').count(), 0);
  await page.unroute('**/api/weekends/2026/2/track?refresh=1');
  checks.push(
    'map refresh failure retains the reference geometry without affecting classification',
  );

  let delayed: PlaywrightRoute | undefined, requested: () => void;
  await page.evaluate(() => localStorage.clear());
  const requestArrived = new Promise<void>((resolve, reject) => {
    requested = resolve;
    setTimeout(
      () => reject(new Error('The delayed navigation request did not arrive.')),
      10000,
    ).unref();
  });
  await page.route('**/api/weekends/2026/1/sessions/qualifying*', (route) => {
    delayed = route;
    requested();
  });
  await page.evaluate(() => {
    location.hash = '#/weekend/2026/1?session=qualifying';
  });
  await requestArrived;
  await page.evaluate(() => {
    location.hash = '#/weekend/2026/1?session=race';
  });
  await resultsReady();
  await delayed!
    .fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(await service.getSession('2026', '1', 'qualifying')),
    })
    .catch(() => {});
  assert.equal(await page.locator('[data-session="race"]').getAttribute('aria-selected'), 'true');
  await page.unroute('**/api/weekends/2026/1/sessions/qualifying*');
  checks.push('navigation ignores a late response from the previous session');

  await goto('#/weekend/2026/2?session=race');
  assert.match(await page.locator('.results-panel').innerText(), /has not started/);
  await goto('#/weekend/2026/2?session=unknown');
  assert.match(await page.locator('#weekend-view').innerText(), /link is invalid/);
  assert.equal((await fetch(url + 'api/weekends/2026/1/sessions/race/laps?driver=0')).status, 400);
  assert.equal((await fetch(url + 'api/weekends/2026/1', { method: 'POST' })).status, 405);
  assert.equal((await fetch(url + 'api/openf1/arbitrary')).status, 404);
  assert.deepEqual(errors, []);
  checks.push('scheduled and invalid routes, API validation and no browser runtime errors');
  const report = {
    fixtureBased: true,
    checks,
    upstreamRequests: fixture.calls.length,
    runtimeErrors: errors,
  };
  await writeFile(artifactPath('browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({ path: artifactPath('failure.png'), fullPage: true });
  console.error(
    JSON.stringify(
      {
        state: await page.evaluate(() => ({
          hash: location.hash,
          views: [...document.querySelectorAll<HTMLElement>('main > div')].map((element) => ({
            id: element.id,
            inert: element.inert,
            style: element.getAttribute('style'),
            ready: element.dataset.readyRoute,
          })),
          animations: document.getAnimations().map((animation) => ({
            state: animation.playState,
            time: animation.currentTime,
            start: animation.startTime,
            element: (animation.effect as KeyframeEffect | null)?.target?.outerHTML.slice(0, 180),
          })),
        })),
        page: await page.locator('body').innerText(),
        errors,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
