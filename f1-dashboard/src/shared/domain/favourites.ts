import { isRecord } from '../contracts/guards.js';
import { nameKey } from './identity.js';
export interface DriverIdentity {
  number?: number | null;
  code?: string | null;
  name_acronym?: string;
  name?: string;
  full_name?: string;
  givenName?: string;
  familyName?: string;
}
export type TeamIdentity = string | { constructorId?: string; name?: string; team_name?: string };
export interface Favourites {
  drivers: string[];
  teams: string[];
}

export const FAVOURITES_KEY = 'gridline:favourites:v1';
export function driverKey(driver: DriverIdentity | null | undefined) {
  const code = driver?.code || driver?.name_acronym;
  if (code) return 'code:' + String(code).toUpperCase();
  const name =
    driver?.name ||
    driver?.full_name ||
    [driver?.givenName, driver?.familyName].filter(Boolean).join(' ');
  return name ? 'name:' + nameKey(name) : null;
}
export function teamKey(team: TeamIdentity | null | undefined) {
  const key = nameKey(
    typeof team === 'string' ? team : team?.constructorId || team?.name || team?.team_name,
  );
  if (!key) return null;
  if (key === 'rb' || key.includes('racingbulls') || key.includes('alphatauri'))
    return 'racingbulls';
  if (key.includes('redbull')) return 'redbull';
  for (const identity of [
    'mercedes',
    'mclaren',
    'ferrari',
    'astonmartin',
    'alpine',
    'williams',
    'haas',
    'audi',
    'sauber',
    'cadillac',
  ])
    if (key.includes(identity)) return identity;
  return key;
}
export function sanitizeFavourites(value: unknown): Favourites {
  const record = isRecord(value) ? value : {};
  const rawDrivers: unknown[] = Array.isArray(record.drivers) ? record.drivers : [];
  const rawTeams: unknown[] = Array.isArray(record.teams) ? record.teams : [];
  const drivers = Array.isArray(record.drivers)
    ? rawDrivers.filter(
        (key): key is string =>
          typeof key === 'string' && /^(code:[A-Z0-9]{1,8}|name:[a-z0-9]{1,100})$/.test(key),
      )
    : [];
  const teams = Array.isArray(record.teams)
    ? rawTeams.filter(
        (key): key is string => typeof key === 'string' && /^[a-z0-9]{1,100}$/.test(key),
      )
    : [];
  return { drivers: [...new Set(drivers)].slice(0, 200), teams: [...new Set(teams)].slice(0, 100) };
}
