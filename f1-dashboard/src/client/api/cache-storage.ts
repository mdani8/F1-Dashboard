import { isRecord } from '../../shared/contracts/guards.js';
import type { StorageAdapter } from '../../shared/contracts/results.js';

export function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
export function readCache<T>(
  storage: StorageAdapter | undefined,
  key: string,
): { data: T; at: number } | null {
  try {
    const value: unknown = JSON.parse(storage?.getItem(key) || 'null');
    return isRecord(value) &&
      typeof value.at === 'number' &&
      Number.isFinite(value.at) &&
      value.data
      ? { data: value.data as T, at: value.at }
      : null;
  } catch {
    return null;
  }
}
export function writeCache(storage: StorageAdapter | undefined, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage may be blocked or full. */
  }
}
