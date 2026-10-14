import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const {chromium} = require('C:/Users/miksi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'Europe/Brussels'});
const errors = [], report = {realData:true,tracks:[],checks:[]};
page.on('pageerror',error => errors.push(error.message));
const ready = () => page.waitForFunction(() => {
  const view = document.querySelector('#weekend-view:not([inert])');
  const slug = new URLSearchParams(location.hash.split('?')[1]).get('session');
  const content = document.querySelector('#session-content > [data-content-identity]:not([inert])');
  return view?.dataset.readyRoute === location.hash && view.dataset.pageMotion === 'settled' && content?.dataset.contentIdentity === slug && getComputedStyle(content).opacity === '1' && document.querySelector('#refresh')?.getAttribute('aria-disabled') !== 'true';
},null,{timeout:60000});
const settle = () => page.waitForFunction(() => !document.getAnimations().some(animation => animation.playState === 'running' && animation.effect?.getComputedTiming().iterations !== Infinity));
async function track(round,session) {
  await page.goto(`http://127.0.0.1:5173/#/weekend/2026/${round}?session=${session}`,{waitUntil:'domcontentloaded'});
  await ready();
  await page.waitForFunction(() => document.querySelector('#circuit-map [data-north-up="true"]'),null,{timeout:60000});
  const map = await page.evaluate(async round => (await fetch(`/api/weekends/2026/${round}/track`)).json(),round);
  assert.equal(map.geometry.version,2);
  assert.equal(map.geometry.orientation.northUp,true);
  assert.equal(map.geometry.sectors.length,3);
  assert.ok(map.geometry.orientation.fitError < .22);
  report.tracks.push({round,circuit:map.circuitName,reference:map.reference,orientation:map.geometry.orientation});
  return map;
}
try {
  await track(11,'race');
  await page.locator('#circuit-map').screenshot({path:'qa/north-hungaroring-desktop.png'});
  await page.getByRole('button',{name:/Sector 2/}).click();
  await page.evaluate(() => {scrollTo({top:0,behavior:'instant'});scrollTo({top:document.querySelector('.weekend-session-tabs').getBoundingClientRect().top + scrollY + 80,behavior:'instant'});});
  const before = await page.evaluate(() => scrollY);
  const tab = await page.locator('[data-session="qualifying"]').boundingBox();
  await page.mouse.click(tab.x + tab.width / 2,tab.y + tab.height / 2);
  await ready();await settle();await page.waitForTimeout(500);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - before) <= 1);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.session),'qualifying');
  assert.equal(await page.getByRole('button',{name:/Sector 2/}).getAttribute('aria-pressed'),'true');
  report.checks.push('real session changes preserve scroll, focus and highlighted track sector');
  const first = page.locator('.results-panel tbody tr').first();
  await first.locator('.entrant-primary .favourite-toggle').click();
  assert.equal(await first.getAttribute('data-favourite'),'true');
  const href = await first.locator('.driver-link').getAttribute('href');
  const number = new URLSearchParams(href.split('?')[1]).get('driver');
  await page.locator('#lap-driver').selectOption(number);await ready();await settle();
  const all = await page.locator('.lap-table tbody tr').count();
  assert.ok(all > 0);
  await page.locator('#lap-filter').selectOption('clean');
  const clean = await page.locator('.lap-table tbody tr').count();
  assert.ok(clean > 0 && clean <= all);
  assert.ok(await page.locator('.lap-table tr[data-fastest="true"]').count() > 0);
  assert.equal(await first.getAttribute('data-favourite'),'true');
  report.analysis = {driver:number,recordedLaps:all,cleanLaps:clean};
  report.checks.push('published lap records support clean filtering and fastest markers; favourites survive driver selection');
  await page.setViewportSize({width:390,height:844});await settle();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  await page.evaluate(() => scrollTo({top:document.querySelector('.lap-panel').getBoundingClientRect().top + scrollY - document.querySelector('.weekend-session-tabs').getBoundingClientRect().height - 12,behavior:'instant'}));
  await page.screenshot({path:'qa/qol-live-mobile-analysis.png'});
  await page.locator('#circuit-map').screenshot({path:'qa/north-hungaroring-mobile.png'});
  report.checks.push('real mobile lap controls and north-oriented map fit the viewport');
  await page.setViewportSize({width:1440,height:1000});
  await track(10,'qualifying');
  await page.locator('#circuit-map').screenshot({path:'qa/north-spa-desktop.png'});
  assert.ok(await page.locator('.results-panel tbody tr').count() > 10);
  report.checks.push('Hungaroring and Spa align to geographic north with real published reference laps');
  assert.deepEqual(errors,[]);
  report.runtimeErrors = errors;
  await writeFile('qa/qol-live-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} catch (error) {
  await page.screenshot({path:'qa/qol-live-failure.png',fullPage:true});
  console.error(JSON.stringify({url:page.url(),errors,body:await page.locator('body').innerText()},null,2));
  throw error;
} finally {await browser.close();}
