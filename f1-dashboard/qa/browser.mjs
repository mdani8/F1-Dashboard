import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createServer } from '../server.mjs';
import { createResultsService } from '../results-service.mjs';
import { createUpstream } from '../upstream.mjs';
import { createFixtureFetcher, fixtureNow } from './fixtures.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require('C:/Users/miksi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let now = fixtureNow, published = true, failPits = false;
const fixture = createFixtureFetcher({override:url => {
  if (url.pathname.endsWith('/session_result') && !published) return new Response('[]');
  if (url.pathname.endsWith('/pit') && failPits) return new Response('{}',{status:503});
}});
const upstream = createUpstream({fetcher:fixture.fetcher,now:() => now,limiter:{take:async () => {},block:() => {}}});
const service = createResultsService({upstream,now:() => now});
const server = createServer({service});
await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'Europe/Brussels'});
await page.clock.install({time:new Date(now)});
const errors = [], requests = [], checks = [];
page.on('pageerror',error => errors.push(error.message));
page.on('request',request => {if (request.url().includes('/api/weekends/')) requests.push(request.url());});
await page.route('https://fonts.googleapis.com/**',route => route.abort());
const ready = () => page.waitForFunction(() => {
  // Playwright advances performance.now(), but Chrome's native animation timeline
  // keeps real time. Align animations scheduled after a virtual polling jump.
  // The separate animation suite uses real timers and never needs this adjustment.
  for (const animation of document.getAnimations()) if (animation.currentTime < -1000) animation.startTime = document.timeline.currentTime;
  if (document.body.dataset.appReady !== 'true' || document.querySelector('#refresh')?.getAttribute('aria-disabled') === 'true') return false;
  if (!location.hash.startsWith('#/weekend')) return document.querySelector('#dashboard-view:not([inert])')?.dataset.pageMotion === 'settled';
  const view = document.querySelector('#weekend-view:not([inert])');
  if (view?.dataset.readyRoute !== location.hash || view.dataset.pageMotion !== 'settled') return false;
  if (view.querySelector('.error-title')) return true;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const content = view.querySelector('#session-content > [data-content-identity]:not([inert])');
  return content?.dataset.contentIdentity === params.get('session');
});
const resultsReady = async () => {await ready();await page.waitForFunction(() => document.querySelectorAll('#weekend-view .results-panel tbody tr').length > 0);};
async function goto(hash) {await page.goto(url + hash,{waitUntil:'domcontentloaded'});await ready();}
try {
  await goto('');
  assert.equal(await page.locator('#drivers-panel tbody tr').count(),3);
  await page.getByRole('tab',{name:'Constructors',exact:true}).click();
  assert.equal(await page.locator('#constructors-panel tbody tr').count(),3);
  await page.getByRole('tab',{name:'Constructors',exact:true}).press('ArrowLeft');
  assert.equal(await page.getByRole('tab',{name:'Drivers',exact:true}).getAttribute('aria-selected'),'true');
  const schedule = page.getByRole('button',{name:'Australian Grand Prix schedule',exact:true});
  await schedule.focus(); await schedule.press('Enter');
  assert.equal(await schedule.getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('#schedule-2026-1 li').count(),5);
  await page.screenshot({path:'qa/desktop.png',fullPage:true});
  checks.push('dashboard standings and separate keyboard schedule toggle');

  await page.getByRole('link',{name:'Australian Grand Prix results',exact:true}).click();
  await resultsReady();
  await page.waitForFunction(() => document.querySelector('#circuit-map')?.dataset.mapStatus === 'available');
  assert.equal(await page.locator('#circuit-map svg [data-sector]').count(),3);
  await page.getByRole('button',{name:/Sector 2/}).click();
  assert.equal(await page.getByRole('button',{name:/Sector 2/}).getAttribute('aria-pressed'),'true');
  await page.evaluate(() => {window.originalMap = document.querySelector('#circuit-map svg');});
  assert.equal(await page.locator('#weekend-title').innerText(),'Australian Grand Prix');
  assert.equal(await page.locator('[data-session="race"]').getAttribute('aria-selected'),'true');
  assert.match(await page.locator('.results-panel').innerText(),/25/);
  assert.match(await page.locator('.results-panel').innerText(),/Awaiting publication/);
  await page.locator('[data-session="practice-1"]').click(); await resultsReady();
  assert.match(await page.locator('.results-panel').innerText(),/1:20.123/);
  assert.match(await page.locator('.points-note').innerText(),/No points awarded/);
  await page.locator('[data-session="qualifying"]').click(); await resultsReady();
  assert.match(await page.locator('.results-panel').innerText(),/Q1/);
  await page.locator('[data-session="qualifying"]').press('ArrowRight'); await resultsReady();
  assert.equal(await page.evaluate(() => document.activeElement.dataset.session),'race');
  await page.locator('.results-panel .driver-link').first().click(); await ready();
  await page.waitForFunction(() => document.querySelectorAll('.lap-table tbody tr').length === 3);
  assert.match(page.url(),/session=race&driver=1/);
  assert.match(await page.locator('.lap-panel').innerText(),/Out lap/);
  assert.match(await page.locator('.lap-panel').innerText(),/HARD/);
  assert.equal(await page.evaluate(() => originalMap === document.querySelector('#circuit-map svg')),true);
  assert.equal(await page.getByRole('button',{name:/Sector 2/}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:/Sector 2/}).focus();
  await page.getByRole('button',{name:/Sector 2/}).press('Space');
  assert.equal(await page.getByRole('button',{name:/Sector 2/}).getAttribute('aria-pressed'),'false');
  checks.push('track map shows three sectors, supports keyboard highlighting and stays mounted across session/driver changes');
  await page.goBack(); await ready();
  assert.match(await page.locator('.lap-panel').innerText(),/Select a driver/);
  await page.goForward(); await ready();
  await page.reload({waitUntil:'domcontentloaded'}); await ready();
  assert.equal(await page.locator('.lap-table tbody tr').count(),3);
  await page.screenshot({path:'qa/weekend-desktop.png',fullPage:true});
  checks.push('weekend and session navigation, qualifying phases, driver laps, direct reload and browser history');

  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  await page.screenshot({path:'qa/weekend-mobile.png',fullPage:true});
  await page.getByRole('link',{name:'Race calendar',exact:true}).click();await ready();
  await page.screenshot({path:'qa/mobile.png',fullPage:true});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  checks.push('mobile dashboard and weekend pages without page overflow');

  published = false;
  await goto('#/weekend/2026/2?session=practice-1');
  assert.match(await page.locator('.results-panel').innerText(),/awaiting publication/);
  assert.equal(await page.locator('[data-session]').count(),5);
  published = true; now += 60001;
  await page.clock.fastForward(60001);await resultsReady();
  assert.equal(await page.locator('.results-panel tbody tr').count(),3);
  checks.push('automatic transition from awaiting publication to results');

  await page.locator('#lap-driver').focus();
  await page.evaluate(() => {document.querySelector('#results-scroll').scrollLeft = 170;});
  const before = await page.evaluate(() => ({scroll:scrollY,left:document.querySelector('#results-scroll').scrollLeft}));
  now += 60001; await page.clock.fastForward(60001);await ready();
  assert.equal(await page.evaluate(() => document.activeElement.id),'lap-driver');
  const after = await page.evaluate(() => ({scroll:scrollY,left:document.querySelector('#results-scroll').scrollLeft}));
  assert.ok(Math.abs(before.scroll - after.scroll) <= 1);
  assert.equal(before.left,after.left);
  checks.push('focus and horizontal/vertical scroll preserved on refresh');

  await page.evaluate(() => {Object.defineProperty(document,'hidden',{configurable:true,get:() => true});document.dispatchEvent(new Event('visibilitychange'));});
  const hiddenCount = requests.length;
  now += 61000; await page.clock.fastForward(61000);
  assert.equal(requests.length,hiddenCount);
  const resumedRequest = page.waitForRequest(request => request.url().includes('/api/weekends/'));
  await page.evaluate(() => {Object.defineProperty(document,'hidden',{configurable:true,get:() => false});document.dispatchEvent(new Event('visibilitychange'));});
  await resumedRequest;
  await ready(); assert.ok(requests.length > hiddenCount);
  checks.push('polling pauses in hidden tabs and refreshes on return');

  failPits = true; now += 2000;await page.clock.fastForward(2000);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await ready();
  assert.match(await page.locator('.strategy-grid section').first().innerText(),/previously retrieved/);
  assert.equal(await page.locator('.results-panel .notice').count(),0);
  assert.equal(await page.locator('.strategy-grid section').last().locator('.notice').count(),0);
  checks.push('independent stale pit data while classification and tires remain fresh');

  await page.waitForFunction(() => document.querySelector('#circuit-map')?.dataset.mapStatus === 'available');
  await page.route('**/api/weekends/2026/2/track?refresh=1',route => route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Map unavailable.'})}));
  await page.getByRole('button',{name:'Refresh track map',exact:true}).click();
  await page.waitForFunction(() => document.querySelector('#circuit-map .notice')?.textContent.includes('previously retrieved'));
  assert.equal(await page.locator('#circuit-map svg [data-sector]').count(),3);
  assert.equal(await page.locator('.results-panel .notice').count(),0);
  await page.unroute('**/api/weekends/2026/2/track?refresh=1');
  checks.push('map refresh failure retains the reference geometry without affecting classification');

  let delayed, requested;
  await page.evaluate(() => localStorage.clear());
  const requestArrived = new Promise((resolve,reject) => {requested = resolve;setTimeout(() => reject(new Error('The delayed navigation request did not arrive.')),10000).unref();});
  await page.route('**/api/weekends/2026/1/sessions/qualifying*',route => {delayed = route;requested();});
  await page.evaluate(() => {location.hash = '#/weekend/2026/1?session=qualifying';});
  await requestArrived;
  await page.evaluate(() => {location.hash = '#/weekend/2026/1?session=race';});
  await resultsReady();
  await delayed.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await service.getSession('2026','1','qualifying'))}).catch(() => {});
  assert.equal(await page.locator('[data-session="race"]').getAttribute('aria-selected'),'true');
  await page.unroute('**/api/weekends/2026/1/sessions/qualifying*');
  checks.push('navigation ignores a late response from the previous session');

  await goto('#/weekend/2026/2?session=race');
  assert.match(await page.locator('.results-panel').innerText(),/has not started/);
  await goto('#/weekend/2026/2?session=unknown');
  assert.match(await page.locator('#weekend-view').innerText(),/link is invalid/);
  assert.equal((await fetch(url + 'api/weekends/2026/1/sessions/race/laps?driver=0')).status,400);
  assert.equal((await fetch(url + 'api/weekends/2026/1',{method:'POST'})).status,405);
  assert.equal((await fetch(url + 'api/openf1/arbitrary')).status,404);
  assert.deepEqual(errors,[]);
  checks.push('scheduled and invalid routes, API validation and no browser runtime errors');
  const report = {fixtureBased:true,checks,upstreamRequests:fixture.calls.length,runtimeErrors:errors};
  await writeFile('qa/browser-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} catch (error) {
  await page.screenshot({path:'qa/failure.png',fullPage:true});
  console.error(JSON.stringify({state:await page.evaluate(() => ({hash:location.hash,views:[...document.querySelectorAll('main > div')].map(element => ({id:element.id,inert:element.inert,style:element.getAttribute('style'),ready:element.dataset.readyRoute})),animations:document.getAnimations().map(animation => ({state:animation.playState,time:animation.currentTime,start:animation.startTime,element:animation.effect?.target?.outerHTML.slice(0,180)}))})),page:await page.locator('body').innerText(),errors},null,2));
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
