import { sessions, validateCalendar } from './shared/data.js';
import { FEED_INTERVAL, classificationHtml, classificationSignature, entityKey, hash, reminderHtml, renderFeed, startOf } from './feed-model.mjs';
import { emptyFeedState, validateFeedState } from './feed-store.mjs';

const DAY = 86400000;
export function createFeedService({service,store,publicBaseUrl,now = Date.now,logger = console,setTimer = setInterval,clearTimer = clearInterval}) {
  let state = emptyFeedState(now()), loaded = false, storageFailure = false, stopped = false, timer, pending, initializing;
  let condition = 'initializing', message = null, lastAttempt = null;
  async function initialize() {
    if (initializing) return initializing;
    initializing = (async () => {
      try {const saved = await store.load();if (saved) state = validateFeedState(saved);loaded = true;condition = state.initialized ? 'ready' : 'initializing';}
      catch (error) {storageFailure = true;condition = 'failed';message = 'RSS history could not be loaded. Restore its backup and restart the application.';logger.error('RSS state load failed:',error.message);}
    })();
    return initializing;
  }
  async function commit(next) {
    await store.save(next);
    state = next;
  }
  async function publish(kind,weekend,session,signature,description,title,schedule = null) {
    const key = entityKey(kind,weekend,session), previous = state.entities[key];
    if (previous?.signature === signature) return;
    const revision = (previous?.revision || 0) + 1, at = now(), next = structuredClone(state);
    const identity = {kind,season:weekend.season,round:weekend.round,slug:session.slug};
    next.entities[key] = {...identity,revision,signature,...(schedule ? {schedule} : {})};
    next.items.unshift({...identity,guid:`urn:gridline:${key}:v${revision}`,publishedAt:at,correction:Boolean(previous),title,description});
    next.items = next.items.slice(0,500);
    next.lastChanged = at;
    next.initialized = true;
    await commit(next);
  }
  async function reminders(weekend) {
    if (weekend.metadata.calendar.stale) return;
    for (const session of weekend.sessions) {
      if (stopped) return;
      const key = entityKey('upcoming',weekend,session), previous = state.entities[key];
      const start = startOf(session);
      const cancelled = session.cancellationKnown ? session.cancelled : previous?.schedule.cancelled || session.cancelled;
      if (!previous && (cancelled || start === null || start <= now() || start > now() + DAY)) continue;
      const schedule = {start,date:session.date,cancelled:Boolean(cancelled),venue:[weekend.circuit,weekend.location,weekend.country].filter(Boolean).join(', ')};
      const name = `${weekend.name} — ${session.name}`;
      await publish('upcoming',weekend,session,hash(schedule),reminderHtml(weekend,{...session,cancelled},start,Boolean(previous)),`${previous ? cancelled ? 'Cancelled' : 'Schedule update' : 'Upcoming'}: ${name}`,schedule);
    }
  }
  async function collect() {
    await initialize();
    if (!loaded || storageFailure || stopped) return;
    lastAttempt = now();
    const failures = [];
    try {
      const calendar = await service.getJolpica('current/races/');
      const table = validateCalendar(calendar.data), season = String(table.season);
      if (calendar.stale) throw new Error('The published calendar is cached after a provider failure.');
      if (stopped) return;
      const today = new Date(now()).toISOString().slice(0,10), races = table.Races;
      const completed = races.filter(race => race.date < today).sort((a,b) => b.date.localeCompare(a.date) || Number(b.round) - Number(a.round)).slice(0,2);
      const active = races.filter(race => race.date >= today && sessions(race).some(session => startOf(session) !== null && startOf(session) <= now()));
      const resultRounds = new Set([...active,...completed].map(race => String(race.round)));
      const selected = new Set(resultRounds);
      for (const race of races) for (const session of sessions(race)) {
        const start = startOf(session), known = state.entities[`upcoming:${season}:${race.round}:${session.slug}`];
        const unresolvedSoon = start === null && session.date >= today && session.date <= new Date(now() + DAY).toISOString().slice(0,10);
        if (unresolvedSoon || start !== null && start > now() && start <= now() + DAY || known && (start !== null && start >= now() || (known.schedule.start ?? 0) >= now() - 2 * DAY)) selected.add(String(race.round));
      }
      // Make an empty preseason feed valid too; persist before exposing a snapshot.
      const snapshot = structuredClone(state);
      snapshot.initialized = true;
      snapshot.entities = Object.fromEntries(Object.entries(snapshot.entities).filter(([,entity]) => Number(entity.season) >= Number(season) - 1));
      await commit(snapshot);
      // Reminders are published before the historical classification collection.
      const weekends = [];
      const candidates = races.filter(race => selected.has(String(race.round))).sort((a,b) => b.date.localeCompare(a.date));
      for (const race of candidates) {
        if (stopped) return;
        try {
          const weekend = await service.getWeekend(season,String(race.round));
          if (stopped) return;
          if (weekend.metadata.calendar.stale) {failures.push('Weekend calendar is stale.');continue;}
          if (weekend.date >= today && weekend.sessions.some(session => startOf(session) !== null && startOf(session) <= now())) resultRounds.add(weekend.round);
          weekends.push(weekend);
          await reminders(weekend);
          if (weekend.metadata.timing.stale || weekend.metadata.timing.at === null) failures.push('Some timing metadata is unavailable.');
        } catch (error) {if (error.code || /RSS state/.test(error.message)) throw error;failures.push(error.message);}
      }
      // Seed old classifications first so the latest session is the newest RSS
      // publication after a cold start; reminders have already been delivered.
      for (const weekend of [...weekends].sort((a,b) => String(a.date || '').localeCompare(String(b.date || '')) || Number(a.round) - Number(b.round))) {
        if (!resultRounds.has(weekend.round)) continue;
        for (const session of [...weekend.sessions].sort((a,b) => (startOf(a) ?? Date.parse(a.date + 'T23:59:59Z')) - (startOf(b) ?? Date.parse(b.date + 'T23:59:59Z')))) {
          if (stopped) return;
          const start = startOf(session);
          if (session.cancelled || (start ?? Date.parse(session.date + 'T23:59:59Z')) > now()) continue;
          try {
            const results = await service.getClassification(weekend,session.slug);
            if (stopped) return;
            if (results.stale || results.status === 'failed') {failures.push(results.message || 'A classification is stale or unavailable.');continue;}
            if (results.status !== 'available' || !results.data.length) continue;
            const previous = state.entities[entityKey('results',weekend,session)];
            await publish('results',weekend,session,classificationSignature(session.slug,results.data),classificationHtml(weekend,session,results,Boolean(previous)),`${previous ? 'Corrected results' : 'Results'}: ${weekend.name} — ${session.name}`);
          } catch (error) {if (error.code || /RSS state/.test(error.message)) throw error;failures.push(error.message);}
        }
      }
      if (!stopped && !failures.length) await commit({...state,lastSuccessfulRefresh:now()});
      condition = failures.length ? 'degraded' : 'ready';
      message = failures.length ? 'Some published data could not be refreshed. Successful feed items are retained.' : null;
      if (failures.length) logger.warn('RSS collection incomplete:',[...new Set(failures)].join(' '));
    } catch (error) {
      condition = 'degraded';message = 'RSS refresh failed. Successful feed items are retained.';
      logger.error('RSS collection failed:',error.message);
    }
  }
  function refresh() {
    if (pending) return pending;
    pending = collect().finally(() => {pending = null;});
    return pending;
  }
  return {
    async start() {
      if (timer) return;
      stopped = false;await initialize();
      if (storageFailure || stopped || timer) return;
      timer = setTimer(() => {void refresh();},FEED_INTERVAL);timer.unref?.();
      void refresh();
    },
    refresh,
    async stop() {stopped = true;if (timer) clearTimer(timer);timer = null;await initializing;await pending;},
    status:() => ({state:condition,items:state.items.length,lastAttempt,lastSuccessfulRefresh:state.lastSuccessfulRefresh,message}),
    snapshot(kind) {
      if (!loaded || storageFailure || !state.initialized) return null;
      return {...renderFeed(state,kind,publicBaseUrl),stale:condition === 'degraded'};
    }
  };
}
