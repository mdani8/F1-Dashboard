import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import type { DriverIdentity, TeamIdentity } from '../../../shared/domain/favourites.js';
import {
  driverKey,
  FAVOURITES_KEY,
  sanitizeFavourites,
  teamKey,
} from '../../../shared/domain/favourites.js';
import { MotionButton } from '../../components/motion.js';
interface FavouritesContextValue {
  isDriver: (driver: DriverIdentity | null | undefined) => boolean;
  isTeam: (team: TeamIdentity | null | undefined) => boolean;
  toggle: (kind: 'drivers' | 'teams', key: string | null, name: string) => void;
}
type FavouriteProps = (
  | { kind: 'drivers'; value?: DriverIdentity | null }
  | { kind: 'teams'; value?: TeamIdentity | null }
) & { name: string };

const Favourites = createContext<FavouritesContextValue | null>(null);
function readSaved() {
  try {
    return sanitizeFavourites(JSON.parse(localStorage.getItem(FAVOURITES_KEY) || 'null'));
  } catch {
    return sanitizeFavourites(null);
  }
}
export function FavouritesProvider({ children }: PropsWithChildren) {
  const [saved, setSaved] = useState(readSaved);
  const [message, setMessage] = useState('');
  useEffect(() => {
    try {
      localStorage.setItem(FAVOURITES_KEY, JSON.stringify(saved));
    } catch {
      /* Preferences remain usable for this visit. */
    }
  }, [saved]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === FAVOURITES_KEY) setSaved(readSaved());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const isDriver = (driver: DriverIdentity | null | undefined) => {
    const key = driverKey(driver);
    return key !== null && saved.drivers.includes(key);
  };
  const isTeam = (team: TeamIdentity | null | undefined) => {
    const key = teamKey(team);
    return key !== null && saved.teams.includes(key);
  };
  function toggle(kind: 'drivers' | 'teams', key: string | null, name: string) {
    if (!key) return;
    const adding = !saved[kind].includes(key);
    setSaved((previous) => ({
      ...previous,
      [kind]: previous[kind].includes(key)
        ? previous[kind].filter((value) => value !== key)
        : [...previous[kind], key],
    }));
    setMessage(`${name} ${adding ? 'added to' : 'removed from'} favourites.`);
  }
  return (
    <Favourites.Provider value={{ isDriver, isTeam, toggle }}>
      {children}
      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
    </Favourites.Provider>
  );
}
export function useFavourites(): FavouritesContextValue {
  const value = useContext(Favourites);
  if (!value) throw new Error('Favourites require their provider.');
  return value;
}
export function FavouriteButton({ kind, value, name }: FavouriteProps) {
  const favourites = useFavourites();
  const key = kind === 'drivers' ? driverKey(value) : teamKey(value);
  if (!key) return null;
  const selected = kind === 'drivers' ? favourites.isDriver(value) : favourites.isTeam(value);
  return (
    <MotionButton
      className="favourite-toggle"
      aria-pressed={selected}
      aria-label={`${selected ? 'Unfollow' : 'Follow'} ${name}`}
      title={`${selected ? 'Remove' : 'Add'} favourite ${kind === 'drivers' ? 'driver' : 'team'}`}
      onClick={() => favourites.toggle(kind, key, name)}
    >
      <span aria-hidden="true">{selected ? '★' : '☆'}</span>
    </MotionButton>
  );
}
