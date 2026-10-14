import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function emptyFeedState(now) {return {version:1,createdAt:now,initialized:false,lastChanged:0,lastSuccessfulRefresh:null,entities:{},items:[]};}
const keyPattern = /^(results|upcoming):20\d{2}:[1-9]\d?:(practice-[123]|qualifying|sprint-qualifying|sprint|race)$/;
export function validateFeedState(state) {
  const fail = () => {throw new Error('RSS state is invalid or uses an unsupported version. Restore a backup before restarting.');};
  if (!state || state.version !== 1 || !Number.isFinite(state.createdAt) || typeof state.initialized !== 'boolean' || !Number.isFinite(state.lastChanged) || (state.lastSuccessfulRefresh !== null && !Number.isFinite(state.lastSuccessfulRefresh)) || !state.entities || typeof state.entities !== 'object' || Array.isArray(state.entities) || !Array.isArray(state.items) || state.items.length > 500) fail();
  for (const [key,entity] of Object.entries(state.entities)) if (!keyPattern.test(key) || !entity || !Number.isInteger(entity.revision) || entity.revision < 1 || typeof entity.signature !== 'string' || entity.signature.length !== 64 || !['results','upcoming'].includes(entity.kind) || !/^20\d{2}$/.test(entity.season) || !/^[1-9]\d?$/.test(entity.round) || key !== `${entity.kind}:${entity.season}:${entity.round}:${entity.slug}` || (entity.kind === 'upcoming' && (!entity.schedule || (entity.schedule.start !== null && !Number.isFinite(entity.schedule.start)) || typeof entity.schedule.cancelled !== 'boolean'))) fail();
  const seen = new Set();
  for (const item of state.items) {
    if (!item || typeof item.title !== 'string' || typeof item.description !== 'string' || !Number.isFinite(item.publishedAt) || typeof item.correction !== 'boolean' || !keyPattern.test(`${item.kind}:${item.season}:${item.round}:${item.slug}`) || typeof item.guid !== 'string' || !new RegExp(`^urn:gridline:${item.kind}:${item.season}:${item.round}:${item.slug}:v[1-9]\\d*$`).test(item.guid) || seen.has(item.guid)) fail();
    seen.add(item.guid);
  }
  return state;
}

export function createFileFeedStore(directory) {
  const root = path.resolve(directory), file = path.join(root,'rss-state.json');
  return {
    async load() {
      await mkdir(root,{recursive:true,mode:0o700});
      try {
        if ((await stat(file)).size > 16 * 1024 * 1024) throw new Error('RSS state exceeds the supported size. Restore a backup.');
        return validateFeedState(JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,'')));
      } catch (error) {if (error.code === 'ENOENT') return null;throw error;}
    },
    async save(state) {
      validateFeedState(state);
      const temporary = path.join(root,`.rss-state-${randomUUID()}.tmp`);
      let handle;
      try {
        await mkdir(root,{recursive:true,mode:0o700});
        handle = await open(temporary,'wx',0o600);
        await handle.writeFile(JSON.stringify(state) + '\n','utf8');await handle.sync();await handle.close();handle = null;
        await rename(temporary,file);
        // Persist the directory entry too where the platform supports directory fsync.
        try {const directoryHandle = await open(root,'r');try {await directoryHandle.sync();} finally {await directoryHandle.close();}} catch { /* Windows does not support directory fsync. */ }
      } finally {if (handle) await handle.close();await rm(temporary,{force:true});}
    }
  };
}

export function createMemoryFeedStore(initial = null) {
  let saved = initial === null ? null : structuredClone(initial);
  return {load:async () => saved === null ? null : structuredClone(validateFeedState(saved)),save:async state => {saved = structuredClone(validateFeedState(state));}};
}
