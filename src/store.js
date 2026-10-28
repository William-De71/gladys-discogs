// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in /data/discogs.json (the only
// writable place of the container):
//   - `seen`     per Discogs account id: the instance ids of the last added
//                copies of the collection and the release ids of the last
//                additions to the wantlist, as read at the last reading. A
//                restart never fires the same event twice, and the first
//                reading of an account is a baseline;
//   - `covers`   per release id, the addresses of its covers (thumbnail and
//                large), so a widget image needs no request to the API after
//                a restart; the last MAX_COVERS only;
//   - `picks`    the release the "random record" widget shows, per folder,
//                until its button draws another one.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/discogs.json';
const MAX_COVERS = 500;
const EMPTY = () => ({ seen: {}, covers: {}, picks: {} });

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger }`.
 * @returns {object} `{ data, load, save, rememberCover }`.
 */
function createStore({ path = DEFAULT_PATH, logger } = {}) {
  const store = {
    data: EMPTY(),
    /**
     * @description Read the file; an absent or broken file is an empty store.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const raw = JSON.parse(await readFile(path, 'utf8'));
        const value = raw && typeof raw === 'object' ? raw : {};
        const part = (name) =>
          value[name] && typeof value[name] === 'object' && !Array.isArray(value[name])
            ? value[name]
            : {};
        store.data = { seen: part('seen'), covers: part('covers'), picks: part('picks') };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger?.warn(`Unable to read ${path}: ${err.message}`);
        }
        store.data = EMPTY();
      }
    },
    /**
     * @description Write the file (atomically: a temporary file, then a rename).
     * @returns {Promise<void>}
     */
    async save() {
      try {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await writeFile(temporary, JSON.stringify(store.data));
        await rename(temporary, path);
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
    /**
     * @description Remember the covers of a release, the oldest forgotten
     * beyond MAX_COVERS.
     * @param {object} release - A parsed release (`releaseId`, `thumb`, `cover`).
     * @returns {boolean} Whether something changed.
     */
    rememberCover(release) {
      if (!release?.thumb && !release?.cover) {
        return false;
      }
      const key = String(release.releaseId);
      const before = store.data.covers[key];
      if (before && before.thumb === release.thumb && before.cover === release.cover) {
        return false;
      }
      delete store.data.covers[key];
      store.data.covers[key] = { thumb: release.thumb, cover: release.cover };
      const keys = Object.keys(store.data.covers);
      for (const old of keys.slice(0, Math.max(0, keys.length - MAX_COVERS))) {
        delete store.data.covers[old];
      }
      return true;
    },
  };
  return store;
}

export { DEFAULT_PATH, MAX_COVERS, createStore };
