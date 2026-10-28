// Detection of the additions between two readings, the event data, the
// outputs of the scene actions.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pageOf,
  detectAdditions,
  additionData,
  randomOutputs,
  priceOutputs,
  collectionOutputs,
  OUTPUTS,
  MAX_EVENTS,
} from '../src/events.js';
import { parseRelease } from '../src/releases.js';
import { fixture } from './helpers/fixtures.js';

const RELEASES = fixture('collection.json').releases.map(parseRelease);
const instanceOf = (release) => release.instanceId;
const copy = (instanceId, addedAt) => ({ ...RELEASES[0], instanceId, addedAt });

test('the first reading is a baseline', () => {
  assert.deepEqual(detectAdditions(undefined, RELEASES, instanceOf), []);
});

test('a new copy on top of the page is an addition, the oldest first', () => {
  const before = pageOf(RELEASES, instanceOf, 25);
  assert.equal(before.full, false);
  const now = [
    copy(2, Date.parse('2026-10-28T09:00:00Z')),
    copy(1, Date.parse('2026-10-28T08:00:00Z')),
    ...RELEASES,
  ];
  assert.deepEqual(detectAdditions(before, now, instanceOf).map(instanceOf), [1, 2]);
  assert.deepEqual(detectAdditions(before, RELEASES, instanceOf), [], 'nothing changed');
});

test('on a full page, an older copy moving up after a removal is no addition', () => {
  const before = pageOf(RELEASES.slice(0, 3), instanceOf, 3);
  assert.equal(before.full, true);
  // The newest copy was removed: the 4th moves up into the page.
  const now = RELEASES.slice(1, 4);
  assert.deepEqual(detectAdditions(before, now, instanceOf), []);
});

test('a bulk import fires MAX_EVENTS events at most', () => {
  const before = pageOf(RELEASES, instanceOf, 25);
  const many = Array.from({ length: 20 }, (_, i) =>
    copy(100 + i, Date.parse('2026-10-28T09:00:00Z') - i),
  );
  assert.equal(detectAdditions(before, [...many, ...RELEASES], instanceOf).length, MAX_EVENTS);
});

test('event data: flat scalars, the folder only for the collection', () => {
  const data = additionData(RELEASES[0], {
    folder: 'ext:discogs:folder:1_3',
    folderName: 'Vinyles',
  });
  for (const [key, value] of Object.entries(data)) {
    assert.ok(['string', 'number', 'boolean'].includes(typeof value), key);
  }
  assert.ok(Object.keys(data).length <= 30);
  assert.equal(data.folder_name, 'Vinyles');
  assert.equal(additionData(RELEASES[0]).folder, undefined);
  assert.equal(additionData({ ...RELEASES[0], year: null }).year, 0);
});

test('outputs: only the declared keys, a sentence in the language', () => {
  const random = randomOutputs(RELEASES[0], { folderName: 'All', language: 'es' });
  assert.deepEqual(Object.keys(random).sort(), [...OUTPUTS.random_release].sort());
  assert.equal(random.summary, 'Esta noche: Darkthrone – Too Old Too Cold (2006, Vinyl).');
  const empty = randomOutputs(null, { folderName: 'CD', language: 'en' });
  assert.equal(empty.found, false);
  assert.equal(empty.release_id, 0);
  const none = priceOutputs(RELEASES[0], { forSale: 0, lowest: null, currency: 'EUR' }, 'de');
  assert.equal(none.lowest_price, -1);
  assert.equal(
    none.summary,
    'Darkthrone – Too Old Too Cold: kein Exemplar im Verkauf auf Discogs.',
  );
  const one = priceOutputs(RELEASES[0], { forSale: 1, lowest: 9, currency: 'USD' }, 'en');
  assert.equal(one.summary, 'Darkthrone – Too Old Too Cold: 1 copy for sale, at 9.00 USD.');
  const collection = collectionOutputs(
    {
      account: { currency: '' },
      profile: { collection: 1, wantlist: 0, forSale: 0 },
      value: null,
      lastAdded: null,
    },
    'en',
  );
  assert.equal(collection.value_median, -1);
  assert.equal(collection.summary, '1 record in the collection, 0 in the wantlist.');
});
