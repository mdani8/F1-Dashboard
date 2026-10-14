import { useEffect, useState } from 'react';

export function useHash() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const changed = () => setHash(location.hash);
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  return hash;
}
