interface PreviewReport {
  url: string;
  weekend: string;
  results: number;
  pits: number;
  tireDrivers: number;
  laps: number;
  runtimeErrors: string[];
  track?: string;
  sprintWeekend?: {
    weekend: string;
    session: string;
    results: number;
    tireDrivers: number;
    track?: string;
  };
  dashboard?: { drivers: number; weekends: number };
}

import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createPage, launchBrowser } from '../support/browser.js';
import { artifactPath } from '../support/paths.js';
const browser = await launchBrowser();
const page = await createPage(browser, {
  viewport: { width: 1440, height: 1000 },
  timezoneId: 'Europe/Brussels',
});
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
const settled = () =>
  page.waitForFunction(() => {
    const view = document.querySelector<HTMLElement>('main > [data-page-motion]:not([inert])');
    const content = document.querySelector<HTMLElement>(
      '#session-content > [data-content-identity]:not([inert])',
    );
    return (
      view?.dataset.pageMotion === 'settled' &&
      (!content || getComputedStyle(content).opacity === '1')
    );
  });
try {
  await page.goto('http://127.0.0.1:5173/#/weekend/2026/1?session=race&driver=63', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(
    () =>
      document.querySelectorAll<HTMLElement>('.results-panel tbody tr').length > 10 &&
      document.querySelectorAll<HTMLElement>('.lap-table tbody tr').length > 10 &&
      document.querySelector<HTMLElement>('#refresh')!.getAttribute('aria-disabled') !== 'true',
    null,
    { timeout: 45000 },
  );
  const report: PreviewReport = {
    url: page.url(),
    weekend: await page.locator('#weekend-title').innerText(),
    results: await page.locator('.results-panel tbody tr').count(),
    pits: await page.locator('.pit-table tbody tr').count(),
    tireDrivers: await page.locator('.tire-driver').count(),
    laps: await page.locator('.lap-table tbody tr').count(),
    runtimeErrors: errors,
  };
  assert.ok(report.pits > 0 && report.tireDrivers > 0);
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('#circuit-map')?.dataset.mapStatus === 'available',
    null,
    { timeout: 45000 },
  );
  assert.equal(await page.locator('#circuit-map svg [data-sector]').count(), 3);
  report.track = await page.locator('.map-reference').innerText();
  await page.locator('#circuit-map').screenshot({ path: artifactPath('track-desktop.png') });
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await settled();
  await page.screenshot({ path: artifactPath('preview-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      document.querySelectorAll<HTMLElement>('.lap-table tbody tr').length > 10 &&
      document.querySelector<HTMLElement>('#refresh')!.getAttribute('aria-disabled') !== 'true',
  );
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('#circuit-map')?.dataset.mapStatus === 'available',
  );
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.ok(
    await page.evaluate(() => {
      const tab = document
        .querySelector<HTMLElement>('[data-session="race"]')!
        .getBoundingClientRect();
      const strip = document
        .querySelector<HTMLElement>('.weekend-session-tabs')!
        .getBoundingClientRect();
      return tab.right <= strip.right + 1 && tab.left >= strip.left - 1;
    }),
  );
  await settled();
  await page.locator('#circuit-map').screenshot({ path: artifactPath('track-mobile.png') });
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: artifactPath('preview-mobile.png') });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5173/#/weekend/2026/2?session=sprint-qualifying', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(
    () =>
      document.querySelectorAll<HTMLElement>('.results-panel tbody tr').length > 10 &&
      document.querySelector<HTMLElement>('#refresh')!.getAttribute('aria-disabled') !== 'true',
    null,
    { timeout: 45000 },
  );
  await settled();
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('#circuit-map')?.dataset.mapStatus === 'available',
    null,
    { timeout: 45000 },
  );
  report.sprintWeekend = {
    weekend: await page.locator('#weekend-title').innerText(),
    session: 'sprint-qualifying',
    results: await page.locator('.results-panel tbody tr').count(),
    tireDrivers: await page.locator('.tire-driver').count(),
  };
  report.sprintWeekend.track = await page.locator('.map-reference').innerText();
  assert.match(await page.locator('.results-panel').innerText(), /Q1/);
  assert.match(await page.locator('.points-note').innerText(), /No points awarded/);
  await page.screenshot({ path: artifactPath('preview-sprint-desktop.png') });
  await page.getByRole('link', { name: 'Gridline home', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll<HTMLElement>('#drivers-panel tbody tr').length > 10 &&
      document.querySelectorAll<HTMLElement>('.race-row').length > 10 &&
      document.querySelector<HTMLElement>('#refresh')!.getAttribute('aria-disabled') !== 'true',
    null,
    { timeout: 45000 },
  );
  await settled();
  report.dashboard = {
    drivers: await page.locator('#drivers-panel tbody tr').count(),
    weekends: await page.locator('.race-row').count(),
  };
  await page.screenshot({ path: artifactPath('preview-dashboard.png') });
  assert.deepEqual(errors, []);
  await writeFile(artifactPath('preview-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
