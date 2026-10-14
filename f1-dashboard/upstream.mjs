const BASES = { jolpica:'https://api.jolpi.ca/ergast/f1/', openf1:'https://api.openf1.org/v1/' };
const LIMITS = { jolpica:{count:400,window:3600000}, openf1:{count:24,window:60000} };

export class ProviderError extends Error {
  constructor(message, status = 502, retryAt = null) {
    super(message);
    this.status = status;
    this.retryAt = retryAt;
  }
}

export function createRateLimiter({ now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), limits = LIMITS } = {}) {
  const states = new Map();
  function state(provider) {
    if (!states.has(provider)) states.set(provider, { starts:[], until:0, queue:Promise.resolve() });
    return states.get(provider);
  }
  return {
    block(provider, until) { state(provider).until = Math.max(state(provider).until, until); },
    async take(provider) {
      const current = state(provider);
      const grant = current.queue.then(async () => {
        const limit = limits[provider];
        current.starts = current.starts.filter(at => at > now() - limit.window);
        const retryAt = Math.max(current.until, current.starts.length >= limit.count ? current.starts[0] + limit.window : 0);
        if (retryAt > now()) throw new ProviderError('The data provider is busy. Retrying automatically.', 429, retryAt);
        const burst = current.starts.filter(at => at > now() - 1000);
        if (burst.length >= 2) await wait(Math.max(1, burst[burst.length - 2] + 1000 - now()));
        // Another response may have applied Retry-After while this request was waiting.
        if (current.until > now()) throw new ProviderError('The data provider is busy. Retrying automatically.', 429, current.until);
        current.starts.push(now());
      });
      current.queue = grant.catch(() => {});
      return grant;
    }
  };
}

export function createUpstream({ fetcher = fetch, now = Date.now, limiter = createRateLimiter({now}) } = {}) {
  const cache = new Map();
  const pending = new Map();
  const failures = new Map();
  async function load(provider, route, { ttl = 900000, force = false, validate = () => {} } = {}) {
    const key = provider + ':' + route;
    const previous = cache.get(key);
    const failure = failures.get(key);
    const fallback = error => {
      if (previous) return { ...previous, stale:true, message:error.message, retryAt:error.retryAt };
      throw error;
    };
    if (pending.has(key)) return pending.get(key);
    if (failure?.retryAt > now()) return fallback(failure.error);
    if (previous && now() - previous.at < (force ? 1000 : ttl)) return previous;
    const request = (async () => {
      try {
        await limiter.take(provider);
        const response = await fetcher(BASES[provider] + route, {
          headers:provider === 'jolpica' ? {'User-Agent':'Gridline/1.0.0','Accept':'application/json'} : {'Accept':'application/json'},
          signal:AbortSignal.timeout(12000)
        });
        if (!response.ok) {
          const retry = response.headers?.get('Retry-After');
          const retryAt = retry === null || retry === undefined ? null : /^\d+(\.\d+)?$/.test(retry) ? now() + Number(retry) * 1000 : Date.parse(retry);
          if (response.status === 429) limiter.block(provider, Number.isFinite(retryAt) ? retryAt : now() + 60000);
          throw new ProviderError(response.status === 429 ? 'The data provider is busy. Retrying automatically.' : 'Could not retrieve data from the provider.', response.status, Number.isFinite(retryAt) ? retryAt : null);
        }
        const data = await response.json();
        validate(data);
        const result = { data, at:now(), stale:false, source:provider === 'jolpica' ? 'Jolpica F1' : 'OpenF1' };
        cache.set(key, result);
        failures.delete(key);
        // Bound memory when browsing many weekends or driver drill-downs.
        if (cache.size > 600) cache.delete(cache.keys().next().value);
        return result;
      } catch (cause) {
        const error = cause instanceof ProviderError ? cause : new ProviderError('Could not retrieve data from the provider.');
        const count = (failures.get(key)?.count || 0) + 1;
        error.retryAt = error.retryAt ?? now() + Math.min(300000, 60000 * 2 ** Math.min(count - 1, 3));
        failures.set(key, {count,retryAt:error.retryAt,error});
        if (failures.size > 600) failures.delete(failures.keys().next().value);
        return fallback(error);
      } finally { pending.delete(key); }
    })();
    pending.set(key, request);
    return request;
  }
  return { load };
}
