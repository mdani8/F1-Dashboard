import { errorMessage } from '../../shared/contracts/guards.js';
import type {
  CachedResponse,
  Clock,
  Fetcher,
  StorageAdapter,
} from '../../shared/contracts/results.js';
import { TTL } from '../../shared/domain/cache-policy.js';
import { readCache, writeCache } from './cache-storage.js';
export type DashboardClient = ReturnType<typeof createDataClient>;
const API = '/api/jolpica/';
export function createDataClient({
  storage,
  fetcher = fetch,
  now = Date.now,
}: { storage?: StorageAdapter; fetcher?: Fetcher; now?: Clock } = {}) {
  function read<T>(key: string) {
    return readCache<T>(storage, 'gridline:v1:' + key);
  }
  async function load<T = unknown>(
    key: string,
    route: string,
    validate: (data: unknown) => unknown,
    force = false,
  ): Promise<CachedResponse<T>> {
    const cached = read<T>(key);
    if (!force && cached && now() - cached.at >= 0 && now() - cached.at < TTL) {
      try {
        validate(cached.data);
        return { ...cached, stale: false };
      } catch {
        /* Ignore invalid cache. */
      }
    }
    try {
      const response = await fetcher(
        API + route + '?format=json&limit=100' + (force ? '&refresh=1' : ''),
        { signal: AbortSignal.timeout(30000) },
      );
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? 'The data provider is busy. Please try again shortly.'
            : 'Unable to reach the data provider.',
        );
      const data: unknown = await response.json();
      validate(data);
      const providerAt = Number(response.headers?.get('X-Data-At'));
      const result: CachedResponse<T> = {
        data: data as T,
        at: providerAt > 0 ? providerAt : now(),
        stale: response.headers?.get('X-Data-Stale') === 'true',
      };
      if (!result.stale) writeCache(storage, 'gridline:v1:' + key, { data, at: result.at });
      return result;
    } catch (error) {
      if (cached) {
        try {
          validate(cached.data);
          return { ...cached, stale: true, error: errorMessage(error) };
        } catch {
          /* Invalid fallback is not displayable. */
        }
      }
      throw error;
    }
  }
  return { load };
}
