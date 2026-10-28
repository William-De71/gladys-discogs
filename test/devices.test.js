// The discovered devices against the rules of Gladys the fake Gladys does not
// check: min / max / read_only / has_feedback on every feature, category /
// type pairs of the SDK, no poll, units of the currencies.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

import {
  buildAccountDevice,
  buildFolderDevice,
  buildAccountStates,
  buildFolderStates,
  deviceFolders,
  parseFolderId,
  MAX_FOLDERS,
} from '../src/device.js';
import { parseRelease } from '../src/releases.js';
import { fakeGladys, fixture, ACCOUNT_ID } from './helpers/fixtures.js';

const ACCOUNT = { id: ACCOUNT_ID, username: 'gladys_tester', currency: 'EUR' };
const FOLDERS = fixture('folders.json').folders;
const PAIRS = new Set(
  Object.entries(DEVICE_FEATURE_TYPES).flatMap(([category, types]) =>
    Object.values(types).map((type) => `${DEVICE_FEATURE_CATEGORIES[category]}/${type}`),
  ),
);

test('every feature: required fields, a category / type pair of the SDK, read-only', () => {
  const devices = [
    buildAccountDevice(fakeGladys, ACCOUNT),
    ...deviceFolders(FOLDERS).map((folder) => buildFolderDevice(fakeGladys, ACCOUNT_ID, folder)),
  ];
  for (const device of devices) {
    assert.equal(device.should_poll, false, device.name);
    assert.equal(device.poll_frequency, undefined, device.name);
    for (const feature of device.features) {
      for (const key of ['min', 'max', 'read_only', 'has_feedback']) {
        assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
      }
      assert.equal(feature.read_only, true);
      const pair = `${feature.category}/${feature.type}`;
      assert.ok(
        PAIRS.has(pair) || pair === 'counter-sensor/integer',
        `${feature.external_id}: ${pair}`,
      );
    }
  }
});

test('the account device: external ids from the account id, units of the currency', () => {
  const device = buildAccountDevice(fakeGladys, ACCOUNT, 'fr');
  assert.equal(device.name, 'Discogs (gladys_tester)');
  assert.equal(device.external_id, `ext:discogs:account:${ACCOUNT_ID}`);
  assert.deepEqual(
    device.features.map((feature) => feature.external_id.split(':').pop()),
    ['collection', 'wantlist', 'for_sale', 'value_min', 'value_median', 'value_max', 'last_added'],
  );
  assert.equal(device.features[0].name, 'Disques dans la collection');
  const units = (currency) =>
    buildAccountDevice(fakeGladys, { ...ACCOUNT, currency }).features[4].unit;
  assert.equal(units('EUR'), 'euro');
  assert.equal(units('USD'), 'dollar');
  assert.equal(units('GBP'), 'pound-sterling');
  assert.equal(units('JPY'), undefined, 'no Gladys unit');
});

test('folder devices: every folder but "All", their id parsed back', () => {
  const folders = deviceFolders(FOLDERS);
  assert.deepEqual(
    folders.map((folder) => folder.name),
    ['Uncategorized', 'Vinyles', 'CD'],
  );
  const device = buildFolderDevice(fakeGladys, ACCOUNT_ID, folders[1], 'de');
  assert.equal(device.name, 'Vinyles (Discogs)');
  assert.equal(device.features[0].name, 'Tonträger im Ordner');
  assert.deepEqual(parseFolderId(device.external_id), { accountId: ACCOUNT_ID, folderId: 3 });
  assert.deepEqual(parseFolderId(`${device.external_id}:count`), {
    accountId: ACCOUNT_ID,
    folderId: 3,
  });
  assert.equal(parseFolderId('ext:discogs:account:1'), null);
  const many = Array.from({ length: 80 }, (_, i) => ({ id: i, name: `F${i}`, count: 1 }));
  assert.equal(deviceFolders(many).length, MAX_FOLDERS);
});

test('states: the known values only, the last record as text', () => {
  const lastAdded = parseRelease(fixture('collection.json').releases[0]);
  const states = buildAccountStates(fakeGladys, {
    account: ACCOUNT,
    profile: { collection: 6, wantlist: null, forSale: 2 },
    value: { min: 1, median: 2.5, max: 3 },
    lastAdded,
  });
  const byFeature = Object.fromEntries(
    states.map((state) => [
      state.device_feature_external_id.split(':').pop(),
      state.state ?? state.text,
    ]),
  );
  assert.deepEqual(byFeature, {
    collection: 6,
    for_sale: 2,
    value_min: 1,
    value_median: 2.5,
    value_max: 3,
    last_added: 'Darkthrone – Too Old Too Cold',
  });
  const none = buildAccountStates(fakeGladys, {
    account: ACCOUNT,
    profile: { collection: 0, wantlist: 0, forSale: 0 },
    value: null,
    lastAdded: null,
  });
  assert.equal(none.length, 3);
  assert.deepEqual(
    buildFolderStates(fakeGladys, ACCOUNT_ID, FOLDERS).map((state) => state.state),
    [2, 3, 1],
  );
});
