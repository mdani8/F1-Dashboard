import { createContext, useContext, useEffect, useState } from 'react';
import { driverKey, teamKey, sanitizeFavourites, FAVOURITES_KEY } from '../shared/qol.js';
import { MotionButton } from './motion.jsx';

const Favourites = createContext(null);
function readSaved() {try {return sanitizeFavourites(JSON.parse(localStorage.getItem(FAVOURITES_KEY)));} catch {return sanitizeFavourites(null);}}
export function FavouritesProvider({children}) {
  const [saved,setSaved] = useState(readSaved);
  const [message,setMessage] = useState('');
  useEffect(() => {
    try {localStorage.setItem(FAVOURITES_KEY,JSON.stringify(saved));} catch { /* Preferences remain usable for this visit. */ }
  },[saved]);
  useEffect(() => {
    const sync = event => {if (event.key === FAVOURITES_KEY) setSaved(readSaved());};
    window.addEventListener('storage',sync);
    return () => window.removeEventListener('storage',sync);
  },[]);
  const isDriver = driver => saved.drivers.includes(driverKey(driver));
  const isTeam = team => saved.teams.includes(teamKey(team));
  function toggle(kind,key,name) {
    if (!key) return;
    const adding = !saved[kind].includes(key);
    setSaved(previous => ({...previous,[kind]:previous[kind].includes(key) ? previous[kind].filter(value => value !== key) : [...previous[kind],key]}));
    setMessage(`${name} ${adding ? 'added to' : 'removed from'} favourites.`);
  }
  return <Favourites.Provider value={{isDriver,isTeam,toggle}}>{children}<p className="sr-only" role="status" aria-live="polite">{message}</p></Favourites.Provider>;
}
export const useFavourites = () => useContext(Favourites);
export function FavouriteButton({kind,value,name}) {
  const favourites = useFavourites();
  const key = kind === 'drivers' ? driverKey(value) : teamKey(value);
  if (!key) return null;
  const selected = kind === 'drivers' ? favourites.isDriver(value) : favourites.isTeam(value);
  return <MotionButton className="favourite-toggle" aria-pressed={selected} aria-label={`${selected ? 'Unfollow' : 'Follow'} ${name}`} title={`${selected ? 'Remove' : 'Add'} favourite ${kind === 'drivers' ? 'driver' : 'team'}`} onClick={() => favourites.toggle(kind,key,name)}><span aria-hidden="true">{selected ? '★' : '☆'}</span></MotionButton>;
}
