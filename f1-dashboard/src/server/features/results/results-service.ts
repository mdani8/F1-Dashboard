import { errorMessage, isRecord, nullableNumber } from '../../../shared/contracts/guards.js';
import type {
  CalendarPayload,
  OpenSession,
  OpenTiming,
} from '../../../shared/contracts/providers.js';
import type {
  Clock,
  LapBundle,
  PitStop,
  Result,
  ScheduledSession,
  Section,
  SessionBundle,
  TireStint,
  Weekend,
} from '../../../shared/contracts/results.js';
import { sessions, timestamp } from '../../../shared/domain/calendar.js';
import { pollingWindow, resultTTL } from '../../../shared/domain/weekend.js';
import {
  matchMeeting,
  normalizeJolpica,
  normalizeLaps,
  normalizeOpenResults,
  normalizePits,
  normalizeStints,
  openSlug,
  rosterDriver,
} from '../../providers/normalization.js';
import type { LoadOptions, Provider, Upstream } from '../../providers/upstream.js';
import { createUpstream, ProviderError } from '../../providers/upstream.js';
import { validRaces, validSessions, validTiming } from '../../providers/validation.js';
import { createTrackService } from '../circuits/track-service.js';
export type ResultsService = ReturnType<typeof createResultsService>;

export function createResultsService({
  upstream = createUpstream(),
  now = Date.now,
}: { upstream?: Upstream; now?: Clock } = {}) {
  function empty<T = never>(
    source: string,
    session: ScheduledSession,
    message: string | null = null,
  ): Section<T> {
    const section: Section<T> = {
      status: session.cancelled ? 'cancelled' : 'awaiting',
      source,
      at: null,
      stale: false,
      data: [],
      message,
    };
    if (!session.cancelled)
      section.status =
        (session.start ?? Date.parse(session.date + 'T23:59:59Z')) > now()
          ? 'scheduled'
          : 'awaiting';
    return section;
  }
  async function section<T, U>(
    provider: Provider,
    route: string,
    session: ScheduledSession,
    normalize: (data: T) => U[],
    options: LoadOptions<T>,
  ): Promise<Section<U>> {
    const source = provider === 'jolpica' ? 'Jolpica F1' : 'OpenF1';
    try {
      const result = await upstream.load(provider, route, options);
      const data = normalize(result.data);
      return {
        status: data.length ? 'available' : 'awaiting',
        data,
        source,
        at: result.at,
        stale: result.stale,
        message: result.message || null,
        retryAt: result.retryAt || null,
      };
    } catch (cause) {
      const error = cause instanceof ProviderError ? cause : new ProviderError(errorMessage(cause));
      const recent = now() < (session.end ?? session.start ?? Date.parse(session.date)) + 86400000;
      return {
        ...empty(source, session),
        status: recent && [401, 403].includes(error.status) ? 'awaiting' : 'failed',
        message:
          recent && [401, 403].includes(error.status)
            ? 'Awaiting free publication after the session.'
            : error.message,
        retryAt: error.retryAt || null,
      };
    }
  }
  async function getWeekend(
    season: string | number,
    round: string | number,
    force = false,
  ): Promise<Weekend> {
    const raceResult = await upstream.load('jolpica', `${season}/${round}/?format=json&limit=100`, {
      force,
      validate: validRaces(season),
    });
    const race = raceResult.data.MRData.RaceTable.Races.find(
      (row) => String(row.round) === String(round) && row.Circuit && row.date,
    );
    if (!race) throw new ProviderError('This weekend is not in the published calendar.', 404);
    let timing: {
      data: OpenSession[];
      at: number | null;
      stale: boolean;
      message?: string;
      source?: string;
    };
    try {
      timing = await upstream.load('openf1', `sessions?year=${season}`, {
        force,
        validate: validSessions,
      });
    } catch (error) {
      timing = { data: [], at: null, stale: false, message: errorMessage(error), source: 'OpenF1' };
    }
    const meetingKey = matchMeeting(race, season, timing.data);
    const meetingSessions =
      meetingKey === null ? [] : timing.data.filter((row) => row.meeting_key === meetingKey);
    const list = sessions(race).map((session) => {
      const matches = meetingSessions.filter((row) => openSlug(row.session_name) === session.slug);
      const matched = matches.length === 1 ? matches[0] : null;
      return {
        ...session,
        start:
          timestamp(session) ?? (matched ? nullableNumber(Date.parse(matched.date_start)) : null),
        end: matched ? nullableNumber(Date.parse(matched.date_end)) : null,
        sessionKey: Number.isInteger(matched?.session_key) ? matched!.session_key : null,
        cancelled: matched?.is_cancelled === true,
        cancellationKnown: typeof matched?.is_cancelled === 'boolean' && !timing.stale,
      };
    });
    return {
      season: String(season),
      round: String(round),
      name: race.raceName,
      circuitId: race.Circuit.circuitId,
      circuit: race.Circuit.circuitName,
      location: race.Circuit.Location?.locality || null,
      country: race.Circuit.Location?.country || null,
      date: race.date,
      time: race.time || null,
      sessions: list,
      meetingKey,
      ...pollingWindow(race, list),
      metadata: {
        calendar: {
          source: 'Jolpica F1',
          at: raceResult.at,
          stale: raceResult.stale,
          message: raceResult.message || null,
        },
        timing: {
          source: 'OpenF1',
          at: timing.at,
          stale: timing.stale,
          message:
            timing.message ||
            (meetingKey === null ? 'Matching timing sessions are not available.' : null),
        },
      },
    };
  }
  async function context(
    season: string | number,
    round: string | number,
    slug: string,
    force: boolean,
  ) {
    const weekend = await getWeekend(season, round);
    const session = weekend.sessions.find((item) => item.slug === slug);
    if (!session) throw new ProviderError('This session is not part of the weekend.', 404);
    return { weekend, session, options: { ttl: resultTTL(weekend, now()), force } };
  }
  async function classification(
    weekend: Weekend,
    session: ScheduledSession,
    roster: OpenTiming[],
    options: LoadOptions,
  ): Promise<Section<Result>> {
    const { season, round } = weekend,
      { slug } = session;
    if (['race', 'sprint', 'qualifying'].includes(slug)) {
      const endpoint =
        slug === 'qualifying' ? 'qualifying' : slug === 'sprint' ? 'sprint' : 'results';
      const field =
        slug === 'qualifying'
          ? 'QualifyingResults'
          : slug === 'sprint'
            ? 'SprintResults'
            : 'Results';
      return section(
        'jolpica',
        `${season}/${round}/${endpoint}/?format=json&limit=100`,
        session,
        (data) =>
          normalizeJolpica(
            data.MRData.RaceTable.Races.find((row) => String(row.round) === String(round))?.[
              field
            ] || [],
            roster,
            slug,
          ),
        {
          ...options,
          validate: (data: unknown): asserts data is CalendarPayload => {
            const validate: ReturnType<typeof validRaces> = validRaces(season);
            validate(data);
            const race = data.MRData.RaceTable.Races.find(
              (row) => String(row.round) === String(round),
            );
            if (
              race &&
              (!Array.isArray(race[field]) ||
                race[field].some((row) => !row.Driver || !row.Constructor))
            )
              throw new Error('Invalid classification response.');
          },
        },
      );
    }
    return session.sessionKey === null
      ? empty('OpenF1', session, weekend.metadata.timing.message)
      : section(
          'openf1',
          `session_result?session_key=${session.sessionKey}`,
          session,
          (data) => normalizeOpenResults(data, roster, slug),
          { ...options, validate: validTiming },
        );
  }
  // RSS needs classifications only. Jolpica already supplies names and teams;
  // OpenF1 needs its roster, but neither path loads pits, stints, laps or maps.
  async function getClassification(weekend: Weekend, slug: string): Promise<Section<Result>> {
    const session = weekend.sessions.find((item) => item.slug === slug);
    if (!session) throw new ProviderError('This session is not part of the weekend.', 404);
    const source = ['race', 'sprint', 'qualifying'].includes(slug) ? 'Jolpica F1' : 'OpenF1';
    if (session.cancelled || empty(source, session).status === 'scheduled')
      return empty(source, session);
    const options = { ttl: resultTTL(weekend, now()) };
    let roster: OpenTiming[] = [];
    if (source === 'OpenF1' && session.sessionKey !== null) {
      const drivers = await section(
        'openf1',
        `drivers?session_key=${session.sessionKey}`,
        session,
        (data) => data,
        { ...options, validate: validTiming },
      );
      if (drivers.status !== 'available' || drivers.stale) return { ...drivers, data: [] };
      roster = drivers.data;
    }
    return classification(weekend, session, roster, options);
  }
  async function getSession(
    season: string | number,
    round: string | number,
    slug: string,
    force = false,
  ): Promise<SessionBundle> {
    const { weekend, session, options } = await context(season, round, slug, force);
    const source = ['race', 'sprint', 'qualifying'].includes(slug) ? 'Jolpica F1' : 'OpenF1';
    if (session.cancelled || empty(source, session).status === 'scheduled')
      return {
        weekend,
        session,
        drivers: empty('OpenF1', session),
        results: empty(source, session),
        pits: empty('OpenF1', session),
        tires: empty('OpenF1', session),
      };
    const mappingMessage =
      weekend.metadata.timing.message || 'Matching timing sessions are not available.';
    const drivers =
      session.sessionKey === null
        ? empty('OpenF1', session, mappingMessage)
        : await section(
            'openf1',
            `drivers?session_key=${session.sessionKey}`,
            session,
            (data) => data,
            { ...options, validate: validTiming },
          );
    const roster = drivers.data;
    const [results, pits, tires] = await Promise.all([
      classification(weekend, session, roster, options),
      session.sessionKey === null
        ? empty<PitStop>('OpenF1', session, mappingMessage)
        : section(
            'openf1',
            'pit?session_key=' + session.sessionKey,
            session,
            (data) => normalizePits(data, roster),
            { ...options, validate: validTiming },
          ),
      session.sessionKey === null
        ? empty<TireStint>('OpenF1', session, mappingMessage)
        : section(
            'openf1',
            'stints?session_key=' + session.sessionKey,
            session,
            (data) => normalizeStints(data, roster),
            { ...options, validate: validTiming },
          ),
    ]);
    const published = results.status === 'available';
    // An empty activity dataset is meaningful once the session classification is published.
    for (const activity of [pits, tires])
      if (published && activity.at && activity.status === 'awaiting') activity.status = 'available';
    return {
      weekend,
      session,
      drivers: { ...drivers, data: roster.map(rosterDriver) },
      results,
      pits,
      tires,
    };
  }
  async function getLaps(
    season: string | number,
    round: string | number,
    slug: string,
    driver: number,
    force = false,
  ): Promise<LapBundle> {
    const { session, options } = await context(season, round, slug, force);
    if (
      session.cancelled ||
      empty('OpenF1', session).status === 'scheduled' ||
      session.sessionKey === null
    )
      return {
        session,
        driver: null,
        laps: empty('OpenF1', session, 'Lap timing is not available for this session.'),
      };
    const roster = await section(
      'openf1',
      `drivers?session_key=${session.sessionKey}`,
      session,
      (data) => data,
      { ...options, validate: validTiming },
    );
    const matched = roster.data.filter((row) => row.driver_number === driver);
    if (roster.status !== 'available')
      return { session, driver: null, laps: { ...roster, data: [] } };
    if (matched.length !== 1)
      throw new ProviderError('This driver is not in the session roster.', 404);
    const [lapData, stints, pits] = await Promise.all([
      section(
        'openf1',
        `laps?session_key=${session.sessionKey}&driver_number=${driver}`,
        session,
        (data) => data,
        { ...options, validate: validTiming },
      ),
      section('openf1', `stints?session_key=${session.sessionKey}`, session, (data) => data, {
        ...options,
        validate: validTiming,
      }),
      section('openf1', `pit?session_key=${session.sessionKey}`, session, (data) => data, {
        ...options,
        validate: validTiming,
      }),
    ]);
    return {
      session,
      driver: rosterDriver(matched[0]!),
      laps: { ...lapData, data: normalizeLaps(lapData.data, stints.data, pits.data) },
      annotations: {
        tires: { status: stints.status, stale: stints.stale },
        pits: { status: pits.status, stale: pits.stale },
      },
    };
  }
  async function getJolpica(route: string, force = false) {
    return upstream.load('jolpica', route + '?format=json&limit=100', {
      force,
      validate: (data: unknown) => {
        if (!isRecord(data) || !data.MRData) throw new Error('Invalid provider response.');
      },
    });
  }
  const { getTrack } = createTrackService({ upstream, getWeekend, now });
  return { getWeekend, getSession, getLaps, getJolpica, getTrack, getClassification };
}
