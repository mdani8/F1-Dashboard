import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const {chromium} = require('C:/Users/miksi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'Europe/Brussels'});
const errors = [], checks = [];
page.on('pageerror',error => errors.push(error.message));
await page.route('https://fonts.googleapis.com/**',route => route.abort());
try {
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('#dashboard-view')?.dataset.pageMotion === 'settled');
  const report = await page.evaluate(async () => {
    const health = await (await fetch('/healthz')).json(), response = await fetch('/feeds/results.xml');
    const document = new DOMParser().parseFromString(await response.text(),'application/xml');
    return {health,feedStatus:response.status,xmlErrors:document.querySelectorAll('parsererror').length,items:[...document.querySelectorAll('item')].map(item => {
      const html = new DOMParser().parseFromString(item.querySelector('description').textContent,'text/html');
      return {title:item.querySelector('title').textContent,guid:item.querySelector('guid').textContent,link:item.querySelector('link').textContent,rows:html.querySelectorAll('tbody tr').length,source:html.body.textContent.includes('Published data: OpenF1') ? 'OpenF1' : 'Jolpica F1'};
    })};
  });
  assert.equal(report.health.status,'ok');assert.equal(report.feedStatus,200);assert.equal(report.xmlErrors,0);
  assert.ok(report.items.length >= 5 && report.items.every(item => item.rows > 10));
  assert.ok(report.items.some(item => item.source === 'OpenF1') && report.items.some(item => item.source === 'Jolpica F1'));
  assert.equal(new Set(report.items.map(item => item.guid)).size,report.items.length);
  assert.ok(report.items.every(item => item.link.startsWith(base + '/#/weekend/')));
  checks.push('running production container serves valid populated RSS with full real classifications from both providers');
  const race = report.items.find(item => item.link.endsWith('session=race')), route = /weekend\/(\d+)\/(\d+)/.exec(race.link);
  const api = await page.evaluate(async ([season,round]) => (await fetch(`/api/weekends/${season}/${round}/sessions/race`)).json(),route.slice(1));
  assert.equal(api.results.status,'available');assert.equal(api.results.data.length,race.rows);
  report.race = {season:route[1],round:route[2],rows:race.rows};
  checks.push('RSS race classification count agrees with the existing real-data session API');
  await page.goto(base + '/#/weekend/2026/11?session=race&driver=44',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.querySelectorAll('.results-panel tbody tr').length > 10 && document.querySelectorAll('.lap-table tbody tr').length > 10 && document.querySelector('#refresh')?.getAttribute('aria-disabled') !== 'true',null,{timeout:60000});
  await page.waitForFunction(() => document.querySelector('#circuit-map [data-north-up="true"]'),null,{timeout:60000});
  assert.equal(await page.locator('#lap-driver').inputValue(),'44');
  await page.locator('#lap-filter').selectOption('clean');assert.ok(await page.locator('.lap-table tbody tr').count() > 0);
  await page.locator('footer').scrollIntoViewIfNeeded();await page.locator('footer').screenshot({path:'qa/rss-live-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.locator('footer').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  await page.locator('footer').screenshot({path:'qa/rss-live-mobile.png'});
  report.hungaroring = {driver:44,results:await page.locator('.results-panel tbody tr').count(),cleanLaps:await page.locator('.lap-table tbody tr').count()};
  checks.push('Docker serves the real Hungaroring driver view, north map, lap filters and mobile subscriptions without overflow');
  assert.deepEqual(errors,[]);report.checks = checks;report.runtimeErrors = errors;
  await writeFile('qa/rss-live-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} catch (error) {console.error(JSON.stringify({url:page.url(),errors,body:await page.locator('body').innerText()},null,2));throw error;}
finally {await browser.close();}
