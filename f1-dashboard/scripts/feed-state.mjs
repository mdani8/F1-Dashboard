import { readFile } from 'node:fs/promises';
import { createFileFeedStore, validateFeedState } from '../feed-store.mjs';

const [command,file] = process.argv.slice(2);
if (command !== 'restore' || !file) {
  console.error('Usage: node scripts/feed-state.mjs restore /path/to/rss-state-backup.json');process.exitCode = 1;
} else {
  try {
    const state = validateFeedState(JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,'')));
    await createFileFeedStore(process.env.DATA_DIR || '.gridline-data').save(state);
    console.log(`Restored ${state.items.length} RSS items. Start Gridline to resume collection.`);
  } catch (error) {console.error(error.message);process.exitCode = 1;}
}
