export function createWeekendClient({ fetcher = fetch, storage, now = Date.now } = {}) {
  const memory = new Map();
  function read(key) {
    if (memory.has(key)) return memory.get(key);
    try {
      const value = JSON.parse(storage?.getItem('gridline:results:v1:' + key) || 'null');
      return value && Number.isFinite(value.at) && value.data ? value : null;
    } catch { return null; }
  }
  async function load(path, {ttl = 900000, force = false, signal, validate = () => {}} = {}) {
    if (signal?.aborted) throw new DOMException('Navigation cancelled.', 'AbortError');
    let cached = read(path);
    if (cached) try { validate(cached.data); } catch { cached = null; }
    if (!force && cached && now() >= cached.at && now() - cached.at < ttl) return cached.data;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort',abort,{once:true});
    const timeout = setTimeout(abort,30000);
    try {
      const response = await fetcher(path + (force ? (path.includes('?') ? '&' : '?') + 'refresh=1' : ''), {signal:controller.signal});
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not load session data.');
      validate(data);
      const value = {data,at:now()};
      memory.set(path,value);
      if (memory.size > 100) memory.delete(memory.keys().next().value);
      try { storage?.setItem('gridline:results:v1:' + path,JSON.stringify(value)); } catch { /* Browser storage may be disabled or full. */ }
      return data;
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Navigation cancelled.','AbortError');
      if (cached) return markStale(cached.data,error.message);
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort',abort);
    }
  }
  return {load};
}

function markStale(value, message) {
  const result = {...value,transportError:message};
  if (value.metadata) result.metadata = Object.fromEntries(Object.entries(value.metadata).map(([key,section]) => [key,{...section,stale:true,message}]));
  if (value.weekend) result.weekend = markStale(value.weekend,message);
  for (const key of ['drivers','results','pits','tires','laps']) if (value[key]) result[key] = {...value[key],stale:true,message};
  return result;
}

export const validateWeekend = value => {
  if (!value || !/^20\d{2}$/.test(value.season) || !Array.isArray(value.sessions) || !value.name || !Number.isFinite(value.pollFrom) || !Number.isFinite(value.pollUntil)) throw new Error('The weekend response is unavailable.');
};
export const validateSession = value => {
  if (!value?.session?.slug || !value.results || !value.pits || !value.tires || !value.drivers || !['results','pits','tires','drivers'].every(key => Array.isArray(value[key].data))) throw new Error('The session response is unavailable.');
};
export const validateLaps = value => {
  if (!value?.session?.slug || !value.laps || !Array.isArray(value.laps.data)) throw new Error('The lap response is unavailable.');
};
