import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createServer } from '../server.mjs';
import { createResultsService } from '../results-service.mjs';
import { createUpstream } from '../upstream.mjs';
import { createFeedService } from '../feed-service.mjs';
import { createMemoryFeedStore } from '../feed-store.mjs';
import { classification, races, fixtureNow, createFixtureFetcher } from './fixtures.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require('C:/Users/miksi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixture = createFixtureFetcher({override:url => {
  if (url.pathname.endsWith('/2026/1/results/')) return new Response(JSON.stringify({MRData:{RaceTable:{season:'2026',Races:[{...races[0],Results:classification.map((row,index) => index ? row : {...row,Driver:{...row.Driver,givenName:'Max & <b>TEST</b>'}})}]}}}));
}});
const service = createResultsService({upstream:createUpstream({fetcher:fixture.fetcher,now:() => fixtureNow,limiter:{take:async () => {},block() {}}}),now:() => fixtureNow});
let feeds;
const server = createServer({service,feeds:{snapshot:kind => feeds?.snapshot(kind),status:() => feeds?.status()}});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}`;
feeds = createFeedService({service,store:createMemoryFeedStore(),publicBaseUrl:base,now:() => fixtureNow,logger:{error() {},warn() {}}});
await feeds.refresh();
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'Europe/Brussels'});
const errors = [], checks = [];
page.on('pageerror',error => errors.push(error.message));
await page.route('https://fonts.googleapis.com/**',route => route.abort());
try {
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('#dashboard-view')?.dataset.pageMotion === 'settled');
  assert.equal(await page.locator('head link[rel="alternate"][type="application/rss+xml"]').count(),3);
  assert.equal(await page.getByRole('navigation',{name:'RSS subscriptions'}).getByRole('link').count(),3);
  checks.push('feed discovery and subscription links exist on the dashboard');
  const parsed = await page.evaluate(async () => {
    const feeds = [];
    for (const kind of ['all','results','upcoming']) {
      const response = await fetch(`/feeds/${kind}.xml`), text = await response.text();
      const document = new DOMParser().parseFromString(text,'application/xml');
      const entries = [...document.querySelectorAll('item')];
      const result = entries.find(item => item.querySelector('guid').textContent.includes(':2026:1:race:'));
      const html = result ? new DOMParser().parseFromString(result.querySelector('description').textContent,'text/html') : null;
      feeds.push({kind,status:response.status,parserErrors:document.querySelectorAll('parsererror').length,items:entries.length,
        link:result?.querySelector('link').textContent,rows:html?.querySelectorAll('tbody tr').length,unsafe:html?.querySelectorAll('script,b').length,
        driver:html?.querySelector('tbody tr td:nth-child(2)').textContent,missingPoints:html?.body.textContent.includes('Awaiting publication')});
    }
    return feeds;
  });
  assert.ok(parsed.every(feed => feed.status === 200 && feed.parserErrors === 0));
  assert.equal(parsed.find(feed => feed.kind === 'results').rows,3);
  assert.equal(parsed[0].unsafe,0);assert.equal(parsed[0].driver,'Max & <b>TEST</b> Verstappen');assert.equal(parsed[0].missingPoints,true);
  checks.push('all feeds parse as XML and escaped classifications retain full rows without injecting markup');
  await page.goto(parsed[0].link,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.querySelectorAll('.results-panel tbody tr').length === 3 && document.querySelector('#weekend-view')?.dataset.pageMotion === 'settled');
  assert.equal(await page.locator('[data-session="race"]').getAttribute('aria-selected'),'true');
  assert.equal(await page.getByRole('navigation',{name:'RSS subscriptions'}).getByRole('link').count(),3);
  checks.push('RSS links open the correct shareable session and subscriptions remain available on weekend pages');
  await page.locator('footer').scrollIntoViewIfNeeded();await page.locator('footer').screenshot({path:'qa/rss-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.locator('footer').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  await page.getByRole('navigation',{name:'RSS subscriptions'}).getByRole('link',{name:'Results',exact:true}).press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent),'24-hour reminders');
  await page.locator('footer').screenshot({path:'qa/rss-mobile.png'});
  checks.push('desktop/mobile subscription controls wrap correctly and support keyboard navigation');
  assert.deepEqual(errors,[]);
  const report = {fixtureBased:true,checks,feeds:parsed,runtimeErrors:errors};
  await writeFile('qa/rss-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {await feeds.stop();await browser.close();await new Promise(resolve => {server.close(resolve);server.closeAllConnections();});}
