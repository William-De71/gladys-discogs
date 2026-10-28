// The HTTP client: authentication, User-Agent, pacing, rate limit, errors,
// and covers read from the image host of Discogs only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDiscogsClient,
  DiscogsError,
  USER_AGENT,
  REQUEST_GAP_MS,
  WINDOW_MS,
} from '../src/discogs-api.js';
import { fakeDiscogs, TOKEN, USERNAME } from './helpers/fixtures.js';

/**
 * @description A client on the fake API, with a fake clock.
 * @param {object} [options] - `{ api, token }`.
 * @returns {object} `{ client, api, clock, waits }`.
 */
function setup({ api = fakeDiscogs(), token = TOKEN } = {}) {
  const clock = { now: 1000000 };
  const waits = [];
  const client = createDiscogsClient({
    fetch: api,
    token,
    now: () => clock.now,
    sleep: async (ms) => {
      waits.push(ms);
      clock.now += ms;
    },
  });
  return { client, api, clock, waits };
}

test('every request carries the token and a User-Agent naming the integration', async () => {
  const seen = [];
  const api = fakeDiscogs();
  const spy = (url, init) => {
    seen.push(init.headers);
    return api(url, init);
  };
  const { client } = setup({ api: spy });
  const identity = await client.identity();
  assert.equal(identity.username, USERNAME);
  assert.equal(seen[0].authorization, `Discogs token=${TOKEN}`);
  assert.equal(seen[0]['user-agent'], USER_AGENT);
  assert.match(USER_AGENT, /^gladys-discogs\/\d+\.\d+\.\d+ \+https:\/\/github\.com\//);
});

test('requests go one at a time, at least the gap apart', async () => {
  const { client, waits } = setup();
  await Promise.all([client.identity(), client.profile(USERNAME), client.folders(USERNAME)]);
  assert.deepEqual(waits, [REQUEST_GAP_MS, REQUEST_GAP_MS]);
  assert.equal(client.requests, 3);
  assert.deepEqual(client.quota, { limit: 60, remaining: 59, used: 1 });
});

test('the window is awaited when no request is left in it', async () => {
  const { client, waits, api } = setup();
  await client.identity();
  client.quota = { limit: 60, remaining: 0, used: 60 };
  await client.profile(USERNAME);
  assert.deepEqual(waits, [WINDOW_MS]);
  assert.equal(api.calls.length, 2);
});

test('errors: no token, refused token, 429 then nothing for a minute, 404, network', async () => {
  const none = setup({ token: '' });
  await assert.rejects(none.client.identity(), { kind: 'token' });
  assert.equal(none.api.calls.length, 0);

  const refused = setup({ token: 'wrong-token-0123456789' });
  await assert.rejects(refused.client.identity(), { kind: 'token', status: 401 });

  const { client, api, clock } = setup();
  api.fail = 'quota';
  await assert.rejects(client.identity(), { kind: 'quota', status: 429 });
  api.fail = null;
  await assert.rejects(client.identity(), { kind: 'quota' });
  assert.equal(api.calls.length, 1, 'nothing sent while blocked');
  clock.now += WINDOW_MS;
  await client.identity();

  await assert.rejects(client.release(1), { kind: 'notFound', status: 404 });
  assert.deepEqual(await client.copies(USERNAME, 1), [], 'not owned');
  assert.equal(await client.removeWant(USERNAME, 1), false, 'not wanted');
  api.fail = 'down';
  await assert.rejects(
    client.identity(),
    (err) => err instanceof DiscogsError && err.kind === 'unreachable',
  );
  api.fail = 'error';
  await assert.rejects(client.identity(), { kind: 'unreachable', status: 502 });
});

test('paths are built from checked values only', async () => {
  const { client, api } = setup();
  await assert.rejects(client.profile('../../oauth'), { kind: 'invalid' });
  await assert.rejects(client.release('12/../1'), { kind: 'invalid' });
  assert.equal(api.calls.length, 0);
  await client.collection(USERNAME, { folder: 3, page: 2, perPage: 1 });
  assert.equal(
    api.calls[0],
    `GET /users/${USERNAME}/collection/folders/3/releases?sort=added&sort_order=desc&page=2&per_page=1`,
  );
  await client.marketStats(644773, 'EUR');
  await client.marketStats(644773, 'EUR&x=1');
  assert.deepEqual(api.calls.slice(1), [
    'GET /marketplace/stats/644773?curr_abbr=EUR',
    'GET /marketplace/stats/644773',
  ]);
});

test('covers: the image host of Discogs only, over https', async () => {
  const { client, api } = setup();
  const bytes = await client.image('https://i.discogs.com/abc/rs:fit/w:150/x.jpeg');
  assert.equal(bytes[0], 0xff);
  await assert.rejects(client.image('https://example.com/x.jpeg'), { kind: 'invalid' });
  await assert.rejects(client.image('http://i.discogs.com/x.jpeg'), { kind: 'invalid' });
  await assert.rejects(client.image('not a url'), { kind: 'invalid' });
  assert.deepEqual(api.calls, ['GET image']);
});
