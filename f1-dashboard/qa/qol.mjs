import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from '../server.mjs';
import { createResultsService } from '../results-service.mjs';
import { createUpstream } from '../upstream.mjs';
import { classification, roster, races, laps, fixtureNow, createFixtureFetcher } from './fixtures.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require('C:/Users/miksi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const results = Array.from({length:25},(_,index) => {
  const base = classification[index % classification.length];
  return index < 3 ? base : {...base,position:String(index + 1),positionText:String(index + 1),number:String(100 + index),Driver:{driverId:`fixture_${index}`,code:`X${String(index).padStart(2,'0')}`,givenName:'Driver',familyName:String(index)},points:String(25 - index)};
});
const drivers = results.map((row,index) => index < 3 ? roster[index] : {...roster[index % 3],driver_number:Number(row.number),name_acronym:row.Driver.code,full_name:`Driver ${index}`});
const analysisLaps = [...laps,
  {driver_number:1,lap_number:4,lap_duration:81.1,duration_sector_1:27.4,duration_sector_2:28.2,duration_sector_3:25.5,is_pit_out_lap:false},
  {driver_number:1,lap_number:5,lap_duration:80.8,duration_sector_1:27.3,duration_sector_2:28.1,duration_sector_3:25.4,is_pit_out_lap:false},
  {driver_number:1,lap_number:6,lap_duration:80.8,duration_sector_1:27.3,duration_sector_2:28.1,duration_sector_3:25.4,is_pit_out_lap:false},
  {driver_number:1,lap_number:7,lap_duration:null,is_pit_out_lap:false},
  {driver_number:1,lap_number:8,lap_duration:79.8}
];
const fixture = createFixtureFetcher({override:url => {
  if (url.pathname.endsWith('/drivers')) return new Response(JSON.stringify(drivers));
  if (url.pathname.endsWith('/laps') && url.searchParams.has('driver_number')) return new Response(JSON.stringify(analysisLaps.map(row => ({...row,driver_number:Number(url.searchParams.get('driver_number'))}))));
  const field = url.pathname.endsWith('/results/') ? 'Results' : url.pathname.endsWith('/qualifying/') ? 'QualifyingResults' : null;
  if (field) {
    const round = url.pathname.split('/').at(-3);
    return new Response(JSON.stringify({MRData:{RaceTable:{season:'2026',Races:races.filter(race => race.round === round).map(race => ({...race,[field]:results}))}}}));
  }
}});
const upstream = createUpstream({fetcher:fixture.fetcher,now:() => fixtureNow,limiter:{take:async () => {},block:() => {}}});
const service = createResultsService({upstream,now:() => fixtureNow});
const server = createServer({service});
await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const contextOptions = {viewport:{width:1440,height:1000},timezoneId:'Europe/Brussels',acceptDownloads:true};
let context = await browser.newContext(contextOptions), page = await context.newPage();
const errors = [], checks = [];
page.on('pageerror',error => errors.push(error.message));
await context.route('https://fonts.googleapis.com/**',route => route.abort());
await page.clock.setFixedTime(new Date(fixtureNow));
const ready = () => page.waitForFunction(() => {
  if (document.body.dataset.appReady !== 'true' || document.querySelector('#refresh')?.getAttribute('aria-disabled') === 'true') return false;
  const view = document.querySelector('main > [data-page-motion]:not([inert])');
  if (!view || view.dataset.pageMotion !== 'settled') return false;
  if (!location.hash.startsWith('#/weekend')) return view.id === 'dashboard-view';
  const slug = new URLSearchParams(location.hash.split('?')[1]).get('session');
  return view.dataset.readyRoute === location.hash && document.querySelector('#session-content > [data-content-identity]:not([inert])')?.dataset.contentIdentity === slug;
});
const settle = () => page.waitForFunction(() => !document.getAnimations().some(animation => animation.playState === 'running' && animation.effect?.getComputedTiming().iterations !== Infinity));
async function goto(hash = '') {await page.goto(url + hash,{waitUntil:'domcontentloaded'});await ready();}
try {
  await goto();
  const initialCountdown = await page.getByRole('timer').innerText();
  await page.clock.setFixedTime(new Date(fixtureNow + 2000));
  await page.waitForFunction(before => document.querySelector('[role="timer"]')?.textContent !== before,initialCountdown);
  assert.match(await page.getByRole('timer').innerText(),/h.*m.*s/);
  checks.push('countdown updates locally without a provider request');

  // Keep clock changes isolated from native animation timelines in the visual checks.
  await context.close();
  context = await browser.newContext(contextOptions);page = await context.newPage();
  page.on('pageerror',error => errors.push(error.message));
  await context.route('https://fonts.googleapis.com/**',route => route.abort());
  await goto();await settle();

  await page.locator('#drivers-panel').getByRole('button',{name:'Follow Max Verstappen',exact:true}).click();
  assert.equal(await page.locator('#drivers-panel tbody tr').first().getAttribute('data-favourite'),'true');
  await page.getByRole('tab',{name:'Constructors',exact:true}).click();
  await page.locator('#constructors-panel').getByRole('button',{name:'Follow Ferrari',exact:true}).click();
  await page.reload({waitUntil:'domcontentloaded'});await ready();
  assert.equal(await page.locator('#drivers-panel tbody tr').first().getAttribute('data-favourite'),'true');
  await page.getByRole('link',{name:'Australian Grand Prix results',exact:true}).click();await ready();
  await page.waitForFunction(() => document.querySelector('#circuit-map')?.dataset.mapStatus === 'available');
  assert.equal(await page.locator('.results-panel tbody tr').count(),25);
  assert.equal(await page.locator('.results-panel tbody tr').nth(0).getAttribute('data-favourite'),'true');
  assert.equal(await page.locator('.results-panel tbody tr').nth(2).getAttribute('data-favourite'),'true');
  assert.equal(await page.locator('.pit-table .entrant').first().getAttribute('data-favourite'),'true');
  assert.equal(await page.locator('.tire-driver .entrant').first().getAttribute('data-favourite'),'true');
  checks.push('driver and team favourites survive reload and highlight standings, results, pits and tires');

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button',{name:'↓ Export calendar',exact:true}).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(),'gridline-2026-round-1.ics');
  await download.saveAs('qa/fixture-weekend-calendar.ics');
  const calendar = await readFile('qa/fixture-weekend-calendar.ics','utf8');
  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length,5);
  assert.match(calendar,/DTSTART:20260308T040000Z/);
  assert.match(calendar,/UID:gridline-2026-1-qualifying@gridline.local/);
  checks.push('calendar download contains every weekend session with UTC starts and stable identifiers');

  await page.evaluate(() => {
    const tab = document.querySelector('.weekend-session-tabs');
    scrollTo({top:tab.getBoundingClientRect().top + scrollY + 80,behavior:'instant'});
  });
  await page.waitForFunction(() => Math.abs(document.querySelector('.weekend-session-tabs').getBoundingClientRect().top) < 1);
  const before = await page.evaluate(() => scrollY);
  await page.evaluate(before => {window.qolBefore = before;},before);
  let delayed, arrived;
  const request = new Promise(resolve => {arrived = resolve;});
  await page.route('**/api/weekends/2026/1/sessions/qualifying',route => {delayed = route;arrived();});
  // A native pointer click avoids Playwright scrolling a sticky element before clicking it.
  const qualifyingTab = await page.locator('[data-session="qualifying"]').boundingBox();
  await page.mouse.click(qualifyingTab.x + qualifyingTab.width / 2,qualifyingTab.y + qualifyingTab.height / 2);await request;
  await page.waitForTimeout(350);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - before) <= 1);
  await delayed.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await service.getSession('2026','1','qualifying'))});
  await ready();await page.waitForTimeout(500);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - before) <= 1);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.session),'qualifying');
  await page.unroute('**/api/weekends/2026/1/sessions/qualifying');
  checks.push('sticky session tabs retain scroll and keyboard focus through a delayed session load');

  const scroll = page.locator('#results-scroll');
  await scroll.scrollIntoViewIfNeeded();
  await scroll.evaluate(element => {element.scrollTop = 250;});
  const header = await page.evaluate(() => ({header:document.querySelector('#results-scroll th').getBoundingClientRect().top,container:document.querySelector('#results-scroll').getBoundingClientRect().top,scroll:document.querySelector('#results-scroll').scrollTop}));
  assert.ok(header.scroll > 0 && Math.abs(header.header - header.container) <= 2);
  await scroll.focus();await scroll.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('#results-scroll').scrollTop > 250);
  checks.push('table headers remain visible during vertical table scrolling and keyboard scrolling works');

  await page.locator('[data-session="race"]').click();await ready();
  await page.locator('#lap-driver').selectOption('1');await ready();
  await page.waitForFunction(() => document.querySelectorAll('.lap-table tbody tr').length === 8);
  assert.equal(await page.locator('.lap-table tr[data-fastest="true"]').count(),2);
  await page.locator('#lap-filter').selectOption('clean');
  assert.equal(await page.locator('.lap-table tbody tr').count(),3);
  await page.locator('#lap-filter').selectOption('pit');
  assert.equal(await page.locator('.lap-table tbody tr').count(),1);
  await page.locator('#lap-filter').selectOption('out');
  assert.equal(await page.locator('.lap-table tbody tr').count(),2);
  await page.locator('#lap-filter').selectOption('clean');
  await page.locator('#lap-driver').selectOption('4');await ready();
  assert.equal(await page.locator('#lap-filter').inputValue(),'clean');
  await page.waitForFunction(() => document.querySelector('.lap-driver-name')?.textContent.includes('Lando'));
  await page.locator('#lap-filter').selectOption('all');
  await settle();
  await page.locator('.lap-panel').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.lap-table')).opacity === '1' && [...document.querySelectorAll('.lap-panel [data-content-identity]')].every(element => getComputedStyle(element).opacity === '1'));
  await page.screenshot({path:'qa/qol-desktop.png'});
  checks.push('lap filters distinguish clean/pit/out records, retain selection across drivers and mark tied fastest clean laps');

  await page.setViewportSize({width:390,height:844});
  await page.locator('#lap-filter').selectOption('clean');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  await settle();
  const mobilePosition = await page.evaluate(() => scrollY);
  await page.evaluate(() => scrollTo({top:document.querySelector('.lap-panel').getBoundingClientRect().top + scrollY - document.querySelector('.weekend-session-tabs').getBoundingClientRect().height - 12,behavior:'instant'}));
  await page.screenshot({path:'qa/qol-mobile-analysis.png'});
  await page.evaluate(top => scrollTo({top,behavior:'instant'}),mobilePosition);
  const mobileTabs = page.locator('[data-session="race"]');
  await mobileTabs.focus();
  const mobileBefore = await page.evaluate(() => scrollY);
  await mobileTabs.press('ArrowLeft');await ready();await page.waitForTimeout(500);
  await settle();
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - mobileBefore) <= 1);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.session),'qualifying');
  assert.ok(await page.evaluate(() => {const tab=document.querySelector('[data-session="qualifying"]').getBoundingClientRect(),strip=document.querySelector('.weekend-session-tabs').getBoundingClientRect();return tab.left >= strip.left - 1 && tab.right <= strip.right + 1;}));
  await page.evaluate(() => {scrollTo({top:0,behavior:'instant'});scrollTo({top:document.querySelector('.weekend-session-tabs').getBoundingClientRect().top + scrollY,behavior:'instant'});});
  await page.screenshot({path:'qa/qol-mobile.png'});
  checks.push('mobile controls fit the viewport and keyboard session switching keeps scroll and the selected tab visible');

  assert.deepEqual(errors,[]);
  const report = {fixtureBased:true,checks,runtimeErrors:errors};
  await writeFile('qa/qol-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} catch (error) {
  await page.screenshot({path:'qa/qol-failure.png',fullPage:true});
  console.error(JSON.stringify({url:page.url(),errors,state:await page.evaluate(() => ({before:window.qolBefore,y:scrollY,height:document.documentElement.scrollHeight,frame:document.querySelector('#session-content')?.getAttribute('style'),tabTop:document.querySelector('.weekend-session-tabs')?.getBoundingClientRect().top,focus:document.activeElement.id,contents:[...document.querySelectorAll('#session-content > [data-content-identity]')].map(element=>({id:element.dataset.contentIdentity,inert:element.inert,style:element.getAttribute('style')}))}))},null,2));
  throw error;
} finally {await context.close();await browser.close();await new Promise(resolve => server.close(resolve));}
