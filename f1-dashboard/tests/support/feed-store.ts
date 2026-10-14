import { validateFeedState } from '../../src/server/features/feeds/feed-store.js';
import type { FeedState, FeedStore } from '../../src/server/features/feeds/types.js';
export function createMemoryFeedStore(initial: FeedState | null = null): FeedStore {
  let saved = initial === null ? null : structuredClone(initial);
  return {
    load: async () => (saved === null ? null : structuredClone(validateFeedState(saved))),
    save: async (state: FeedState) => {
      saved = structuredClone(validateFeedState(state));
    },
  };
}
