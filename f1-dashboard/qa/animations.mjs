import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from '../server.mjs';
import { createResultsService } from '../results-service.mjs';
import { createUpstream } from '../upstream.mjs';
import { classification, races, fixtureNow, createFixtureFetcher } from './fixtures.mjs';

const require = createRequire(import.meta.url);
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(import.meta.dirname,'../node_modules/.cache/playwright');
const {chromium} = require('C:/Users/miksi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let now = fixtureNow, changed = false;
const fixture = createFixtureFetcher({override:url => {
  if (changed && url.pathname.endsWith('/2026/1/results/')) return new Response(JSON.stringify({MRData:{RaceTable:{season:'2026',Races:[{...races[0],Results:classification.map((row,index) => ({...row,...(index === 0 ? {points:'18',Time:{time:'1:32:15.623'}} : index === 2 ? {status:'Disqualified',points:'0'} : {})}))}]}}}));
}});
const upstream = createUpstream({fetcher:fixture.fetcher,now:() => now,limiter:{take:async () => {},block:() => {}}});
const server = createServer({service:createResultsService({upstream,now:() => now})});
await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context = await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Europe/Brussels',recordVideo:{dir:'qa/recordings',size:{width:1440,height:1000}}});
const page = await context.newPage();
const video = page.video(), errors = [], checks = [];
page.on('pageerror',error => errors.push(error.message));
await context.route('https://fonts.googleapis.com/**',route => route.abort());
// Only Date is fixed: Motion's animation clock and native browser animations run normally.
await page.clock.setFixedTime(new Date(now));
const ready = target => target.waitForFunction(() => {
  if (document.body.dataset.appReady !== 'true' || document.querySelector('#refresh')?.getAttribute('aria-disabled') === 'true') return false;
  const view = document.querySelector('main > [data-page-motion]:not([inert])');
  if (!view || view.dataset.pageMotion !== 'settled') return false;
  if (!location.hash.startsWith('#/weekend')) return view.id === 'dashboard-view';
  if (view.dataset.readyRoute !== location.hash) return false;
  const params = new URLSearchParams(location.hash.split('?')[1]);
  const content = view.querySelector('#session-content > [data-content-identity]:not([inert])');
  return content?.dataset.contentIdentity === params.get('session');
});
const settle = target => target.waitForFunction(() => !document.getAnimations().some(animation => animation.playState === 'running' && animation.effect?.getComputedTiming().iterations !== Infinity));
async function refresh() {
  now += 1100;
  await page.clock.setFixedTime(new Date(now));
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await ready(page);
}
try {
  await page.goto(url,{waitUntil:'domcontentloaded'});await ready(page);
  await page.getByRole('tab',{name:'Constructors',exact:true}).click();
  const schedule = page.getByRole('button',{name:'Australian Grand Prix schedule',exact:true});
  // Interrupt the expansion before its geometry finishes, then reopen it.
  await schedule.evaluate(element => element.click());
  await page.waitForTimeout(45);
  await schedule.evaluate(element => element.click());
  await page.waitForTimeout(45);
  await schedule.evaluate(element => element.click());
  await settle(page);
  assert.equal(await schedule.getAttribute('aria-expanded'),'true');
  assert.ok(await page.locator('#schedule-2026-1').isVisible());
  await page.locator('#schedule-2026-1 a').first().focus();
  await schedule.evaluate(element => element.click());
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')),'Australian Grand Prix schedule');
  assert.equal(await page.locator('#schedule-2026-1').evaluate(element => element.parentElement.inert),true);
  await settle(page);
  await schedule.click();await settle(page);
  checks.push('interrupted disclosure settles correctly and closing moves focus out of inert content');

  await page.evaluate(() => {
    window.tireSamples = [];
    window.sampleTires = true;
    const sample = () => {
      for (const element of document.querySelectorAll('[data-tire-reveal]')) tireSamples.push(new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
      if (sampleTires) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.getByRole('link',{name:'Australian Grand Prix results',exact:true}).click();await ready(page);
  await page.locator('.tire-timelines').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-tire-reveal]')].every(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a >= .999));
  assert.ok(await page.evaluate(() => tireSamples.some(scale => scale > 0 && scale < .99)));
  await page.evaluate(() => {sampleTires = false;scrollTo({top:0,behavior:'instant'});});
  checks.push('tire color bars reveal on first visibility while labels retain fixed geometry');
  // Select several tabs before the previous content has finished exiting.
  await page.locator('[data-session="practice-1"]').evaluate(element => element.click());
  await page.waitForTimeout(30);
  assert.ok(await page.locator('#session-content > [inert]').count());
  await page.locator('[data-session="qualifying"]').evaluate(element => element.click());
  await page.waitForTimeout(30);
  await page.locator('[data-session="race"]').evaluate(element => element.click());
  await ready(page);await settle(page);
  assert.equal(await page.locator('#session-content > [data-content-identity]').count(),1);
  assert.match(await page.locator('.results-panel table').getAttribute('aria-label'),/Race results/);
  await page.getByRole('link',{name:'Race calendar',exact:true}).click();await ready(page);await settle(page);
  assert.equal(await page.getByRole('tab',{name:'Constructors',exact:true}).getAttribute('aria-selected'),'true');
  assert.equal(await schedule.getAttribute('aria-expanded'),'true');
  await page.screenshot({path:'qa/react-desktop.png',fullPage:true});
  checks.push('rapid session changes settle on the latest tab; dashboard tab and schedules survive navigation');

  await page.getByRole('link',{name:'Australian Grand Prix results',exact:true}).click();await ready(page);
  await page.locator('.tire-timelines').scrollIntoViewIfNeeded();await settle(page);
  await page.evaluate(() => {
    window.motionQA = {highlights:[],replays:[],page:document.querySelector('#weekend-view'),table:document.querySelector('.results-panel table'),cell:document.querySelector('.results-panel .points'),tires:[...document.querySelectorAll('[data-tire-reveal]')]};
    const observer = new MutationObserver(records => {for (const record of records) {
      if (record.attributeName === 'data-highlight' && record.target.dataset.highlight === 'true') motionQA.highlights.push(record.target.textContent);
      if (record.attributeName === 'data-page-motion' && record.target.dataset.pageMotion === 'entering') motionQA.replays.push('page');
      if (record.attributeName === 'style' && record.target.hasAttribute('data-tire-reveal') && new DOMMatrixReadOnly(getComputedStyle(record.target).transform).a < .99) motionQA.replays.push('tire');
    }});
    observer.observe(document.body,{attributes:true,subtree:true,attributeFilter:['style','data-page-motion','data-highlight']});
  });
  assert.equal(await page.locator('[data-highlight="true"]').count(),0);
  await refresh();await settle(page);
  assert.equal(await page.evaluate(() => document.activeElement.id),'refresh');
  assert.deepEqual(await page.evaluate(() => ({highlights:motionQA.highlights,replays:motionQA.replays})),{highlights:[],replays:[]});
  assert.equal(await page.evaluate(() => motionQA.page === document.querySelector('#weekend-view') && motionQA.table === document.querySelector('.results-panel table') && motionQA.tires.every(element => element.isConnected)),true);
  checks.push('unchanged refresh retains mounted tables and tire bars without entrances or timestamp highlights');

  await page.setViewportSize({width:390,height:844});
  await page.locator('#lap-driver').scrollIntoViewIfNeeded();
  await page.locator('#lap-driver').focus();
  await page.evaluate(() => document.querySelector('#results-scroll').scrollLeft = 160);
  const before = await page.evaluate(() => ({scroll:scrollY,left:document.querySelector('#results-scroll').scrollLeft}));
  // Keep keyboard focus in place while requesting an actual published value change.
  changed = true;now += 1100;await page.clock.setFixedTime(new Date(now));
  await page.locator('#refresh').evaluate(element => element.click());
  await page.waitForFunction(() => document.querySelector('.results-panel .points')?.textContent === '18' && document.querySelector('.results-panel .points')?.dataset.highlight === 'true');
  assert.equal(await page.evaluate(() => motionQA.cell === document.querySelector('.results-panel .points')),true);
  assert.equal(await page.evaluate(() => document.activeElement.id),'lap-driver');
  assert.deepEqual(await page.evaluate(() => ({scroll:scrollY,left:document.querySelector('#results-scroll').scrollLeft})),before);
  await ready(page);await settle(page);
  await page.waitForFunction(() => !document.querySelector('[data-highlight="true"]'));
  const highlights = await page.evaluate(() => motionQA.highlights);
  assert.ok(highlights.includes('18') && highlights.includes('0') && highlights.includes('Disqualified') && highlights.includes('1:32:15.623'));
  assert.deepEqual(await page.evaluate(() => motionQA.replays),[]);
  checks.push('published points, time and status update immediately, highlight briefly and preserve DOM, focus and scroll');

  let delayed, release;
  const arrived = new Promise(resolve => {release = resolve;});
  await page.route('**/sessions/race/laps?driver=1',route => {delayed = route;release();});
  await page.locator('#lap-driver').selectOption('1');await arrived;
  await page.locator('#lap-driver').selectOption('4');await ready(page);await settle(page);
  await page.waitForFunction(() => document.querySelector('.lap-driver-name')?.textContent.includes('Lando'));
  await delayed.abort().catch(() => {});
  assert.match(page.url(),/driver=4/);
  assert.equal(await page.evaluate(() => motionQA.page === document.querySelector('#weekend-view') && motionQA.table === document.querySelector('.results-panel table')),true);
  assert.deepEqual(await page.evaluate(() => motionQA.replays),[]);
  await page.locator('[data-session="race"]').focus();await page.locator('[data-session="race"]').press('Home');await ready(page);
  await page.locator('[data-session="practice-1"]').press('End');await ready(page);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.session),'race');
  assert.ok(await page.evaluate(() => {const tab=document.querySelector('[data-session="race"]').getBoundingClientRect(),strip=document.querySelector('.weekend-session-tabs').getBoundingClientRect();return tab.left >= strip.left-1 && tab.right <= strip.right+1;}));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  await page.locator('.tire-timelines').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-tire-reveal]')].every(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a >= .999));
  await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));
  await settle(page);
  await page.screenshot({path:'qa/react-mobile.png',fullPage:true});
  checks.push('driver changes during loading ignore old requests, retain session content and support visible mobile keyboard tabs');

  const reducedContext = await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Brussels',reducedMotion:'reduce'});
  const reduced = await reducedContext.newPage();
  reduced.on('pageerror',error => errors.push(error.message));
  await reducedContext.route('https://fonts.googleapis.com/**',route => route.abort());
  await reduced.clock.setFixedTime(new Date(now));
  await reduced.goto(url,{waitUntil:'domcontentloaded'});await ready(reduced);
  const reducedSchedule = reduced.getByRole('button',{name:'Australian Grand Prix schedule',exact:true});
  await reducedSchedule.click();
  assert.ok(await reduced.locator('#schedule-2026-1').isVisible());
  assert.ok(await reduced.locator('#schedule-2026-1').evaluate(element => element.parentElement.clientHeight >= element.clientHeight && getComputedStyle(element.parentElement).opacity === '1'));
  await reduced.getByRole('link',{name:'Australian Grand Prix results',exact:true}).click();await ready(reduced);
  await reduced.locator('.tire-timelines').scrollIntoViewIfNeeded();
  assert.ok(await reduced.locator('[data-tire-reveal]').evaluateAll(elements => elements.every(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a === 1)));
  assert.equal(await reduced.locator('#weekend-view').evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42),0);
  let pending, reached;
  const refreshArrived = new Promise(resolve => {reached = resolve;});
  await reduced.route('**/api/weekends/2026/1?refresh=1',route => {pending = route;reached();});
  await reduced.locator('#refresh').evaluate(element => element.click());await refreshArrived;
  assert.equal(await reduced.locator('.refresh-icon').evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).isIdentity),true);
  assert.equal(await reduced.locator('#refresh').getAttribute('aria-disabled'),'true');
  await pending.continue();await ready(reduced);
  await reducedContext.close();
  checks.push('reduced motion uses immediate disclosure/tire geometry, no page translation and no busy rotation');

  assert.deepEqual(errors,[]);
  const report = {fixtureBased:true,checks,runtimeErrors:errors,recording:'qa/animations.webm'};
  await writeFile('qa/animation-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} catch (error) {
  await page.screenshot({path:'qa/animation-failure.png',fullPage:true});
  console.error(JSON.stringify({url:page.url(),errors,body:await page.locator('body').innerText()},null,2));
  throw error;
} finally {
  await context.close();
  await video.saveAs('qa/animations.webm');
  await video.delete();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
