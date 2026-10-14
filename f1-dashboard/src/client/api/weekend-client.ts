import { errorMessage, isRecord } from '../../shared/contracts/guards.js';
import type { Clock, Fetcher, StorageAdapter } from '../../shared/contracts/results.js';
import { readCache, writeCache } from './cache-storage.js';
export type WeekendClient = ReturnType<typeof createWeekendClient>;
export function createWeekendClient({
  fetcher = fetch,
  storage,
  now = Date.now,
}: { fetcher?: Fetcher; storage?: StorageAdapter; now?: Clock } = {}) {
  const memory = new Map<string, { data: unknown; at: number }>();
  function read<T>(key: string) {
    return (memory.get(key) || readCache<T>(storage, 'gridline:results:v1:' + key)) as {
      data: T;
      at: number;
    } | null;
  }
  async function load<T = unknown>(
    path: string,
    {
      ttl = 900000,
      force = false,
      signal,
      validate = () => {},
    }: {
      ttl?: number;
      force?: boolean;
      signal?: AbortSignal;
      validate?: (value: unknown) => asserts value is T;
    } = {},
  ): Promise<T> {
    const assertValid: (value: unknown) => asserts value is T = validate;
    if (signal?.aborted) throw new DOMException('Navigation cancelled.', 'AbortError');
    let cached = read<T>(path);
    if (cached)
      try {
        assertValid(cached.data);
      } catch {
        cached = null;
      }
    if (!force && cached && now() >= cached.at && now() - cached.at < ttl) return cached.data;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 30000);
    try {
      const response = await fetcher(
        path + (force ? (path.includes('?') ? '&' : '?') + 'refresh=1' : ''),
        { signal: controller.signal },
      );
      const data: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          isRecord(data) && typeof data.message === 'string'
            ? data.message
            : 'Could not load session data.',
        );
      assertValid(data);
      const value = { data, at: now() };
      memory.set(path, value);
      if (memory.size > 100) memory.delete(memory.keys().next().value!);
      writeCache(storage, 'gridline:results:v1:' + path, value);
      return data;
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Navigation cancelled.', 'AbortError');
      if (cached) return markStale(cached.data, errorMessage(error));
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
  return { load };
}

function markStale<T>(value: T, message: string): T {
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = { ...value, transportError: message };
  if (isRecord(value.metadata))
    result.metadata = Object.fromEntries(
      Object.entries(value.metadata).map(([key, section]) => [
        key,
        isRecord(section) ? { ...section, stale: true, message } : section,
      ]),
    );
  if (isRecord(value.weekend)) result.weekend = markStale(value.weekend, message);
  for (const key of ['drivers', 'results', 'pits', 'tires', 'laps'])
    if (isRecord(value[key])) result[key] = { ...value[key], stale: true, message };
  return result as T;
}
