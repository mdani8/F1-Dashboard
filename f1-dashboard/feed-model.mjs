import { createHash } from 'node:crypto';
import { formatDuration, weekendHref } from './shared/weekend-model.js';
import { driverKey, teamKey } from './shared/qol.js';

export const FEED_INTERVAL = 300000;
export const FEED_LIMIT = 100;
export const FEED_KINDS = ['all','results','upcoming'];
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const xml = value => String(value ?? '').replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const value = input => input === null || input === undefined || input === '' ? '—' : String(input);
const time = input => typeof input === 'number' ? formatDuration(input) : value(input);
export const entityKey = (kind,weekend,session) => `${kind}:${weekend.season}:${weekend.round}:${session.slug}`;
export const startOf = session => Number.isFinite(session.start) ? session.start : session.date && session.time && Number.isFinite(Date.parse(`${session.date}T${session.time}`)) ? Date.parse(`${session.date}T${session.time}`) : null;

export function classificationSignature(slug,rows) {
  return hash({slug,rows:rows.map(row => ({driver:driverKey(row.driver),team:teamKey(row.driver.team),position:row.positionLabel,grid:row.grid,laps:row.laps,
    points:row.points,time:row.time,gap:row.gap,status:row.status,qTimes:row.qTimes,bestLap:row.bestLap})).sort((a,b) => String(a.driver).localeCompare(String(b.driver)))});
}

export function classificationHtml(weekend,session,section,correction) {
  const race = ['race','sprint'].includes(session.slug), qualifying = ['qualifying','sprint-qualifying'].includes(session.slug);
  const headings = race ? ['Position','Driver','Team','Grid','Time / gap','Status','Laps','Points'] : qualifying ? ['Position','Driver','Team','Q1','Q2','Q3','Status'] : ['Position','Driver','Team','Best lap','Gap','Laps','Status'];
  const rows = section.data.map(row => {
    const cells = [value(row.positionLabel),value(row.driver.name),value(row.driver.team)];
    if (race) cells.push(value(row.grid),value(row.gap || row.time),value(row.status),value(row.laps),row.points === null ? 'Awaiting publication' : value(row.points));
    else if (qualifying) cells.push(...(row.qTimes || [null,null,null]).map(time),value(row.status));
    else cells.push(time(row.bestLap),typeof row.gap === 'number' ? row.gap === 0 ? '—' : '+' + row.gap.toFixed(3) : value(row.gap),value(row.laps),value(row.status));
    return '<tr>' + cells.map(cell => `<td>${xml(cell)}</td>`).join('') + '</tr>';
  });
  const start = startOf(session);
  return `${correction ? '<p>The published classification has changed. The full updated results follow.</p>' : ''}<p>${xml(weekend.name)} · ${xml(session.name)}${start === null ? '' : ' · ' + xml(new Date(start).toUTCString())}</p>${race ? '' : '<p>No points awarded for this session.</p>'}<table><thead><tr>${headings.map(text => `<th scope="col">${xml(text)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table><p>Published data: ${xml(section.source)}. Missing values remain unavailable. See Gridline for pit stops, tires and lap analysis.</p>`;
}

export function reminderHtml(weekend,session,start,correction) {
  const status = session.cancelled ? 'This previously announced session has been cancelled.' : correction ? 'The announced session schedule has changed.' : 'This session is scheduled to start within the next 24 hours.';
  return `<p>${status}</p><p>${xml(weekend.name)} · ${xml(session.name)}</p><p>Scheduled start: ${start === null ? xml(session.date) + ' · Time TBC' : xml(new Date(start).toUTCString())}</p><p>${xml([weekend.circuit,weekend.location,weekend.country].filter(Boolean).join(', '))}</p><p>Schedule: Jolpica F1 / OpenF1. Reader polling determines when this reminder is delivered.</p>`;
}

export function renderFeed(state,kind,baseUrl) {
  if (!FEED_KINDS.includes(kind)) throw new Error('Unknown feed.');
  const title = {all:'Results and session reminders',results:'Session results',upcoming:'24-hour session reminders'}[kind];
  const items = state.items.filter(item => kind === 'all' || item.kind === kind).sort((a,b) => b.publishedAt - a.publishedAt || b.guid.localeCompare(a.guid)).slice(0,FEED_LIMIT);
  const body = items.map(item => {
    const link = baseUrl + '/' + weekendHref(item.season,item.round,item.slug);
    return `<item><title>${xml(item.title)}</title><link>${xml(link)}</link><guid isPermaLink="false">${xml(item.guid)}</guid><pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate><category>${item.kind === 'results' ? 'Results' : 'Session reminders'}</category>${item.correction ? '<category>Correction</category>' : ''}<description>${xml(item.description + `<p><a href="${xml(link)}">Open the session in Gridline</a></p>`)}</description></item>`;
  }).join('\n');
  const modified = state.lastChanged || state.createdAt;
  const document = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Gridline — ${xml(title)}</title><link>${xml(baseUrl + '/')}</link><description>Formula 1 published classifications, session reminders and corrections. Free data from Jolpica F1 and OpenF1.</description><language>en-gb</language><generator>Gridline</generator><ttl>5</ttl><lastBuildDate>${new Date(modified).toUTCString()}</lastBuildDate><atom:link href="${xml(baseUrl + `/feeds/${kind}.xml`)}" rel="self" type="application/rss+xml"/>
${body}
</channel></rss>\n`;
  return {xml:document,etag:`"${hash(document)}"`,lastModified:new Date(modified).toUTCString(),modifiedAt:modified,count:items.length};
}
