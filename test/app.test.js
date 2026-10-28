// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, and a
// fake Discogs API serving real (reduced) answers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, ACTIONS, SCENE_ACTIONS } from '../src/app.js';
import { TRIGGERS, OUTPUTS } from '../src/events.js';
import { WIDGETS, WIDGET_ACTIONS } from '../src/widgets.js';
import {
  fakeDiscogs,
  addCopy,
  storePath,
  silent,
  noSleep,
  NOW,
  TZ,
  TOKEN,
  ACCOUNT_ID,
  BARCODE,
  JPEG,
} from './helpers/fixtures.js';

const CONFIG = { token: TOKEN, language: 'fr' };
const PREFIX = 'ext:test-integration';
const ACCOUNT = `${PREFIX}:account:${ACCOUNT_ID}`;
const VINYLES = `${PREFIX}:folder:${ACCOUNT_ID}_3`;
const CD = `${PREFIX}:folder:${ACCOUNT_ID}_4`;

/**
 * @description The integration, connected to a fake Gladys and a fake API.
 * @param {object} [options] - `{ config, path, api, random }`.
 * @returns {Promise<object>} `{ gladys, app, api, clock, path }`.
 */
async function startApp({
  config = CONFIG,
  path = storePath(),
  api = fakeDiscogs(),
  random = () => 0,
} = {}) {
  const clock = { now: NOW };
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    fetch: api,
    storePath: path,
    now: () => clock.now,
    sleep: noSleep,
    random,
    timeZone: TZ,
    timers: false,
    logger: silent,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, api, clock, path };
}

const createAll = async (gladys) => {
  for (const device of gladys.fake.discoveredDevices) {
    await gladys.fake.deviceCreated(device);
  }
};

/**
 * @description Run a scene action and return its outputs, throw on failure.
 * @param {object} gladys - The fake Gladys.
 * @param {string} key - The scene action.
 * @param {object} [fields] - Its fields.
 * @returns {Promise<object>} The outputs.
 */
async function runScene(gladys, key, fields = {}) {
  const ack = await gladys.fake.sceneAction(key, fields);
  if (!ack.success) {
    throw new Error(ack.error);
  }
  return ack.data.outputs;
}

/**
 * @description The content of a widget.
 * @param {object} gladys - The fake Gladys.
 * @param {string} key - The widget.
 * @param {object} [options] - `{ settings, language }`.
 * @returns {Promise<object>} The content.
 */
const widget = async (gladys, key, options = {}) =>
  (await gladys.fake.widgetGet(key, options)).data.content;

/**
 * @description The bytes of a widget image, throw on failure.
 * @param {object} gladys - The fake Gladys.
 * @param {string} key - The image key.
 * @returns {Promise<string>} The base64.
 */
async function widgetImage(gladys, key) {
  const ack = await gladys.fake.widgetGetImage(key);
  if (!ack.success) {
    throw new Error(ack.error);
  }
  return ack.data.image;
}

test('startup: the account of the token and its folders are offered', async () => {
  const { gladys, api, app } = await startApp();
  assert.deepEqual(
    api.calls.map((call) => call.split('?')[0]),
    [
      'GET /oauth/identity',
      'GET /users/gladys_tester',
      'GET /users/gladys_tester/collection/folders',
      'GET /users/gladys_tester/collection/value',
      'GET /users/gladys_tester/collection/folders/0/releases',
      'GET /users/gladys_tester/wants',
    ],
  );
  assert.match(api.calls[4], /sort=added&sort_order=desc/);
  assert.match(api.calls[5], /sort=added&sort_order=desc/);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['Discogs (gladys_tester)', 'Uncategorized (Discogs)', 'Vinyles (Discogs)', 'CD (Discogs)'],
  );
  assert.equal(gladys.fake.discoveredDevices[0].external_id, ACCOUNT);
  assert.equal(app.getAccount().currency, 'EUR');
  const status = gladys.fake.connectionStatus;
  assert.equal(status.connected, true);
  assert.equal(
    status.message.fr,
    'Connecté en tant que gladys_tester : 6 disques, lus toutes les 30 min.',
  );
  assert.equal(gladys.fake.states.length, 0, 'no state before the devices exist');
});

test('created devices get their states: counts, value in euros, last record, folders', async () => {
  const { gladys } = await startApp();
  await createAll(gladys);
  const value = (key) => gladys.fake.lastState(`${ACCOUNT}:${key}`);
  assert.equal(value('collection'), 6);
  assert.equal(value('wantlist'), 5);
  assert.equal(value('for_sale'), 2);
  assert.equal(value('value_min'), 301.15);
  assert.equal(value('value_median'), 612.8);
  assert.equal(value('value_max'), 1234.5);
  const text = gladys.fake.states.find(
    (s) => s.device_feature_external_id === `${ACCOUNT}:last_added`,
  );
  assert.equal(text.text, 'Darkthrone – Too Old Too Cold');
  assert.equal(gladys.fake.lastState(`${VINYLES}:count`), 3);
  assert.equal(gladys.fake.lastState(`${CD}:count`), 1);
  const median = gladys.fake.discoveredDevices[0].features.find((f) =>
    f.external_id.endsWith('median'),
  );
  assert.equal(median.unit, 'euro');
});

test('no value for this account: the counts are still published', async () => {
  const api = fakeDiscogs();
  api.noValue = true;
  const { gladys, app } = await startApp({ api });
  await createAll(gladys);
  assert.equal(app.getSnapshot().value, null);
  assert.equal(gladys.fake.lastState(`${ACCOUNT}:collection`), 6);
  assert.equal(
    gladys.fake.states.some((s) => s.device_feature_external_id.endsWith('value_median')),
    false,
  );
});

test('a record added to the collection or the wantlist fires once, never again after a restart', async () => {
  const path = storePath();
  const api = fakeDiscogs();
  const first = await startApp({ path, api });
  assert.equal(first.gladys.fake.sceneEvents.length, 0, 'the first reading is a baseline');
  addCopy(api);
  api.wants.unshift({ ...api.wants[0], id: 999, date_added: '2026-10-28T01:00:00-07:00' });
  await first.app.read();
  const events = first.gladys.fake.sceneEvents;
  assert.deepEqual(
    events.map((event) => event.key),
    [TRIGGERS.COLLECTION_ADDED, TRIGGERS.WANTLIST_ADDED],
  );
  const added = events[0].data;
  assert.equal(added.release_id, 644773);
  assert.equal(added.title, 'London Calling');
  assert.equal(added.artist, 'The Clash');
  assert.equal(added.year, 1999);
  assert.equal(added.format, 'CD');
  assert.equal(added.folder, CD, 'the folder device, for the trigger filter');
  assert.equal(added.folder_name, 'CD');
  assert.match(added.url, /^https:\/\/www\.discogs\.com\/release\/644773$/);
  assert.equal(events[1].data.release_id, 999);
  assert.equal(events[1].data.folder, undefined);
  await first.gladys.fake.shutdown();
  const stored = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(stored.seen[String(ACCOUNT_ID)].collection.ids[0], 2200000001);

  const second = await startApp({ path, api });
  assert.equal(second.gladys.fake.sceneEvents.length, 0, 'nothing twice after a restart');
});

test('scene actions: a random record, of the collection or of a folder', async () => {
  const { gladys, api } = await startApp({ random: () => 0.99 });
  const all = await runScene(gladys, SCENE_ACTIONS.RANDOM_RELEASE, {});
  assert.equal(all.found, true);
  assert.equal(all.title, 'Wasted Years · Stranger In A Strange Land', 'the 6th of 6');
  assert.equal(all.folder_name, 'All');
  assert.equal(
    all.summary,
    'Ce soir : Iron Maiden – Wasted Years · Stranger In A Strange Land (1990, Vinyl).',
  );
  assert.deepEqual(Object.keys(all).sort(), [...OUTPUTS.random_release].sort());
  assert.match(api.calls.at(-1), /folders\/0\/releases\?.*page=6&per_page=1/);
  const cd = await runScene(gladys, SCENE_ACTIONS.RANDOM_RELEASE, { folder: CD });
  assert.equal(cd.title, 'Flight Of Icarus · The Trooper');
  assert.equal(cd.folder_name, 'CD');
});

test('scene action: search a barcode, only the releases really printed with it', async () => {
  const { gladys } = await startApp();
  const found = await runScene(gladys, SCENE_ACTIONS.SEARCH_BARCODE, {
    barcode: '5 099749 534728',
  });
  assert.equal(found.found, true);
  assert.equal(found.matches, 3);
  assert.equal(found.release_id, 4444523, 'the pressing most owned first');
  assert.equal(found.artist, 'The Clash');
  assert.equal(found.title, 'London Calling');
  assert.match(found.summary, /^Code-barres 5099749534728 : The Clash – London Calling/);
  const unknown = await runScene(gladys, SCENE_ACTIONS.SEARCH_BARCODE, {
    barcode: '3700000000001',
  });
  assert.equal(unknown.found, false, 'the loose matches of Discogs are not taken');
  assert.equal(unknown.matches, 0);
  await assert.rejects(runScene(gladys, SCENE_ACTIONS.SEARCH_BARCODE, { barcode: '12' }));
  assert.ok(BARCODE);
});

test('scene action: add to the collection, once, and never an event for it', async () => {
  const { gladys, api, app } = await startApp();
  const owned = await runScene(gladys, SCENE_ACTIONS.ADD_TO_COLLECTION, {
    release: 'https://www.discogs.com/release/1430077-Darkthrone-Too-Old-Too-Cold',
  });
  assert.equal(owned.added, false);
  assert.equal(owned.already_owned, true);
  assert.equal(owned.copies, 1);
  assert.equal(owned.folder_name, 'Vinyles');
  assert.equal(api.added.length, 0);

  const added = await runScene(gladys, SCENE_ACTIONS.ADD_TO_COLLECTION, {
    release: 'r644773',
    folder: CD,
  });
  assert.equal(added.added, true);
  assert.equal(added.title, 'London Calling');
  assert.equal(added.artist, 'The Clash');
  assert.equal(added.folder_name, 'CD');
  assert.deepEqual(api.added, [{ folder: 4, release: 644773, instance: 3000000000 }]);

  addCopy(api, { instance_id: 3000000000 });
  await app.read();
  assert.equal(gladys.fake.sceneEvents.length, 0, 'a scene added it: no trigger');

  const duplicate = await runScene(gladys, SCENE_ACTIONS.ADD_TO_COLLECTION, {
    release: '644773',
    allow_duplicate: true,
  });
  assert.equal(duplicate.added, true);
  assert.equal(duplicate.copies, 2);
  assert.equal(api.added[1].folder, 1, 'Uncategorized by default');
  await assert.rejects(
    runScene(gladys, SCENE_ACTIONS.ADD_TO_COLLECTION, { release: 'London Calling' }),
  );
});

test('scene actions: wantlist, price, collection', async () => {
  const { gladys, api } = await startApp();
  const wanted = await runScene(gladys, SCENE_ACTIONS.ADD_TO_WANTLIST, {
    release: '644773',
  });
  assert.equal(wanted.summary, 'The Clash – London Calling est dans la wantlist.');
  assert.deepEqual(api.wanted, [644773]);

  const removed = await runScene(gladys, SCENE_ACTIONS.REMOVE_FROM_WANTLIST, {
    release: '1201588',
  });
  assert.equal(removed.removed, true);
  const absent = await runScene(gladys, SCENE_ACTIONS.REMOVE_FROM_WANTLIST, {
    release: '644773',
  });
  assert.equal(absent.removed, false);

  const price = await runScene(gladys, SCENE_ACTIONS.GET_PRICE, { release: '644773' });
  assert.equal(price.for_sale, 137);
  assert.equal(price.lowest_price, 1.1);
  assert.equal(price.currency, 'EUR');
  assert.equal(
    price.summary,
    'The Clash – London Calling : 137 exemplaires en vente, à partir de 1.10 EUR.',
  );
  assert.match(
    api.calls.find((c) => c.includes('/marketplace/')),
    /curr_abbr=EUR/,
  );

  const collection = await runScene(gladys, SCENE_ACTIONS.GET_COLLECTION, {});
  assert.equal(collection.records, 6);
  assert.equal(collection.value_median, 612.8);
  assert.equal(
    collection.summary,
    '6 disques dans la collection, 5 dans la wantlist. Valeur : 612.80 EUR (de 301.15 EUR à 1234.50 EUR).',
  );
});

test('widgets: collection, recent with covers, random with a draw button', async () => {
  const { gladys, app } = await startApp({ random: () => 0 });
  for (const language of ['en', 'fr']) {
    const collection = await widget(gladys, WIDGETS.COLLECTION, { language });
    assert.deepEqual(validateWidgetContent(collection), []);
    assert.equal(collection.components.filter((c) => c.type === 'value').length, 6);
  }
  const recent = await widget(gladys, WIDGETS.RECENT, { settings: { count: 3 } });
  assert.deepEqual(validateWidgetContent(recent), []);
  const list = recent.components.find((c) => c.type === 'card-list');
  assert.equal(list.display, 'grid');
  assert.equal(list.items.length, 3);
  assert.equal(list.items[0].image, 'dg-1430077-s');

  const wants = await widget(gladys, WIDGETS.RECENT, {
    settings: { list: 'wantlist', display: 'list' },
  });
  assert.equal(wants.components.find((c) => c.type === 'card-list').items.length, 5);

  const random = await widget(gladys, WIDGETS.RANDOM, {});
  assert.deepEqual(validateWidgetContent(random), []);
  assert.equal(random.components[0].text, 'Too Old Too Cold');
  const image = random.components.find((c) => c.type === 'image');
  assert.equal(image.key, 'dg-1430077-l');
  const bytes = await widgetImage(gladys, image.key);
  assert.equal(Buffer.from(bytes, 'base64').compare(JPEG), 0);

  app.store.data.picks = {};
  const toast = (await gladys.fake.widgetAction(WIDGETS.RANDOM, WIDGET_ACTIONS.DRAW, { folder: 4 }))
    .data.message;
  assert.match(toast.en, /^Drawn: Iron Maiden – Flight Of Icarus/);
  assert.equal(app.store.data.picks['4'].releaseId, 1874515);
});

test('a cover of a release never read is found through the API, only on the image host', async () => {
  const { gladys, api } = await startApp();
  const bytes = await widgetImage(gladys, 'dg-644773-s');
  assert.ok(bytes.length > 0);
  assert.ok(api.calls.includes('GET /releases/644773'));
  await assert.rejects(widgetImage(gladys, '../etc/passwd'));
});

test('no token: nothing is read and the status says what to do', async () => {
  const { gladys, api } = await startApp({ config: {} });
  assert.equal(api.calls.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /personal access token/);
  const content = await widget(gladys, WIDGETS.COLLECTION, { language: 'fr' });
  assert.match(content.components[0].text, /jeton d’accès personnel/);
});

test('a refused token, the rate limit, an unreachable API: a clear status', async () => {
  const api = fakeDiscogs();
  api.token = 'another-token-entirely';
  const { gladys, app } = await startApp({ api });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Discogs a refusé le jeton/);

  api.token = TOKEN;
  await app.read();
  assert.equal(gladys.fake.connectionStatus.connected, true);

  api.fail = 'quota';
  await app.read();
  assert.match(gladys.fake.connectionStatus.message.en, /60 per minute/);
  api.fail = 'down';
  app.api.blockedUntil = 0;
  await app.read();
  assert.match(gladys.fake.connectionStatus.message.en, /cannot be reached/);
});

test('configuration actions: test the connection, diagnostic without the token', async () => {
  const { gladys } = await startApp();
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(ack.data.message.fr, /^Connecté en tant que gladys_tester : 6 disques/);
  assert.match(ack.data.message.fr, /3 dossier\(s\)/);
  const lines = [];
  const logger = { ...silent, info: (line) => lines.push(line) };
  const other = createFakeGladys({ config: CONFIG });
  const app = createApp(other, {
    fetch: fakeDiscogs(),
    storePath: storePath(),
    now: () => NOW,
    sleep: noSleep,
    timers: false,
    logger,
  });
  await other.connect();
  await app.whenReady();
  await other.fake.action(ACTIONS.DIAGNOSTIC);
  const report = lines.filter((line) => line.startsWith('Discogs diagnostic')).join('');
  assert.ok(report.includes('…ABCD'));
  assert.ok(!report.includes(TOKEN), 'the token never reaches the logs');
});
