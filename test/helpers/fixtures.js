// A fake Discogs API for the tests, served through the `fetch` option of the
// integration. The catalog answers are real ones, read on 2026-10-28 and
// reduced: the six last copies added to a public collection, the five last
// additions to a public wantlist (sorted by date with `sort=added`), a barcode
// search (London Calling, 5099749534728), the loose matches Discogs returns
// for an unknown barcode, the marketplace statistics and the page of one
// release. The answers only the owner of an account can read (identity,
// profile with its counts and currency, folders, value) are shaped after the
// official documentation, for a test account "gladys_tester". Data provided
// by Discogs. Tests never touch the network.

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NOW = Date.parse('2026-10-28T10:00:00Z');
const TZ = 'Europe/Paris';
const TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789ABCD';
const USERNAME = 'gladys_tester';
const ACCOUNT_ID = 1234567;
const BARCODE = '5099749534728';
// The bytes of a tiny JPEG: what the image host answers.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

const silent = { info() {}, warn() {}, error() {}, debug() {} };
const clone = (value) => JSON.parse(JSON.stringify(value));
const noSleep = async () => {};

/**
 * @description A temporary path for the file kept in /data.
 * @returns {string} The path (its directory exists, the file does not).
 */
const storePath = () => join(mkdtempSync(join(tmpdir(), 'discogs-')), 'discogs.json');

/**
 * @description A Gladys client enough for building devices.
 */
const fakeGladys = {
  externalIds(type, key) {
    const device = `ext:discogs:${type}:${key}`;
    return { device, feature: (feature) => `${device}:${feature}` };
  },
};

/**
 * @description A JSON answer.
 * @param {number} status - The HTTP status.
 * @param {unknown} body - The body.
 * @param {object} [headers] - Extra headers.
 * @returns {Response} The answer.
 */
function answer(status, body, headers = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-discogs-ratelimit': '60',
      'x-discogs-ratelimit-remaining': '59',
      'x-discogs-ratelimit-used': '1',
      ...headers,
    },
  });
}

/**
 * @description The fake API.
 * @returns {Function} A `fetch`, with `calls` (`METHOD path`), the data it
 * serves (`collection`, `wants`, `folders`, `profile`, `value`, to change
 * between two readings), `added` (the copies added by POST), `fail`
 * (`null`, `'quota'`, `'down'` or `'error'`) and `noValue`.
 */
function fakeDiscogs() {
  const api = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const { hostname, pathname, searchParams, search } = new URL(url);
    api.calls.push(`${method} ${hostname === 'i.discogs.com' ? 'image' : `${pathname}${search}`}`);
    if (hostname === 'i.discogs.com') {
      return new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }
    if (api.fail === 'quota') {
      return answer(429, { message: "You're making requests too quickly." });
    }
    if (api.fail === 'down') {
      throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND') });
    }
    if (api.fail === 'error') {
      return answer(502, { message: 'Bad gateway' });
    }
    if (init.headers?.authorization !== `Discogs token=${api.token}`) {
      return answer(401, { message: 'You must authenticate to access this resource.' });
    }
    const user = `/users/${USERNAME}`;
    if (pathname === '/oauth/identity') {
      return answer(200, fixture('identity.json'));
    }
    if (pathname === user) {
      return answer(200, clone(api.profile));
    }
    if (pathname === `${user}/collection/folders`) {
      return answer(200, { folders: clone(api.folders) });
    }
    if (pathname === `${user}/collection/value`) {
      return api.noValue
        ? answer(403, { message: 'You are not allowed to view this resource.' })
        : answer(200, clone(api.value));
    }
    let match = /^\/users\/[^/]+\/collection\/folders\/(\d+)\/releases$/.exec(pathname);
    if (match && method === 'GET') {
      const folder = Number(match[1]);
      const all = api.collection.filter((r) => folder === 0 || r.folder_id === folder);
      const perPage = Number(searchParams.get('per_page') ?? 50);
      const page = Number(searchParams.get('page') ?? 1);
      return answer(200, {
        pagination: { page, per_page: perPage, items: all.length },
        releases: clone(all.slice((page - 1) * perPage, page * perPage)),
      });
    }
    match = /^\/users\/[^/]+\/collection\/folders\/(\d+)\/releases\/(\d+)$/.exec(pathname);
    if (match && method === 'POST') {
      const instance = 3000000000 + api.added.length;
      api.added.push({ folder: Number(match[1]), release: Number(match[2]), instance });
      return answer(201, { instance_id: instance, resource_url: 'https://api.discogs.com/…' });
    }
    match = /^\/users\/[^/]+\/collection\/releases\/(\d+)$/.exec(pathname);
    if (match) {
      const copies = api.collection.filter((r) => r.id === Number(match[1]));
      return answer(200, { pagination: { items: copies.length }, releases: clone(copies) });
    }
    if (pathname === `${user}/wants`) {
      const perPage = Number(searchParams.get('per_page') ?? 50);
      return answer(200, {
        pagination: { page: 1, per_page: perPage, items: api.wants.length },
        wants: clone(api.wants.slice(0, perPage)),
      });
    }
    match = /^\/users\/[^/]+\/wants\/(\d+)$/.exec(pathname);
    if (match) {
      const id = Number(match[1]);
      if (method === 'PUT') {
        api.wanted.push(id);
        return answer(201, { id, rating: 0 });
      }
      if (method === 'DELETE') {
        return api.wants.some((w) => w.id === id)
          ? answer(204)
          : answer(404, { message: 'The requested resource was not found.' });
      }
    }
    if (pathname === '/database/search') {
      return answer(
        200,
        searchParams.get('barcode') === BARCODE
          ? fixture('search.json')
          : fixture('search-unknown.json'),
      );
    }
    match = /^\/marketplace\/stats\/(\d+)$/.exec(pathname);
    if (match) {
      return answer(200, fixture('stats.json'));
    }
    match = /^\/releases\/(\d+)$/.exec(pathname);
    if (match && Number(match[1]) === 644773) {
      return answer(200, fixture('release.json'));
    }
    return answer(404, { message: 'The requested resource was not found.' });
  };
  api.calls = [];
  api.token = TOKEN;
  api.profile = fixture('profile.json');
  api.folders = fixture('folders.json').folders;
  api.value = fixture('value.json');
  api.collection = fixture('collection.json').releases;
  api.wants = fixture('wants.json').wants;
  api.added = [];
  api.wanted = [];
  api.fail = null;
  api.noValue = false;
  return api;
}

/**
 * @description A copy of a release of the collection fixture, added now.
 * @param {object} api - The fake API.
 * @param {object} [changes] - `{ id, instance_id, folder_id, date_added, title }`.
 * @returns {object} The raw copy, put first in the collection.
 */
function addCopy(api, { title = 'London Calling', ...changes } = {}) {
  const base = clone(api.collection[0]);
  const copy = {
    ...base,
    id: 644773,
    instance_id: 2200000001,
    folder_id: 4,
    date_added: '2026-10-28T02:30:00-07:00',
    ...changes,
    basic_information: {
      ...base.basic_information,
      id: changes.id ?? 644773,
      title,
      year: 1999,
      artists: [{ name: 'The Clash', anv: '', join: '', id: 1 }],
      formats: [{ name: 'CD', qty: '1', descriptions: ['Album', 'Reissue'] }],
    },
  };
  api.collection.unshift(copy);
  return copy;
}

export {
  NOW,
  TZ,
  TOKEN,
  USERNAME,
  ACCOUNT_ID,
  BARCODE,
  JPEG,
  silent,
  clone,
  noSleep,
  storePath,
  fakeGladys,
  fakeDiscogs,
  addCopy,
  fixture,
};
