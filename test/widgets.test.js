// Every widget content passes the validator of the SDK (the core's rules), in
// every language, and credits Discogs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildCollectionWidget,
  buildRecentWidget,
  buildRandomWidget,
  readCount,
  readOption,
  tileAmount,
  RECENT_COUNT,
  LISTS,
  WIDGET_ACTIONS,
} from '../src/widgets.js';
import { parseRelease } from '../src/releases.js';
import { parseImageKey, imageKeyOf } from '../src/images.js';
import { LANGUAGES } from '../src/i18n.js';
import { fixture, NOW, TZ } from './helpers/fixtures.js';

const COLLECTION = fixture('collection.json').releases.map(parseRelease);
const WANTS = fixture('wants.json').wants.map(parseRelease);
const SNAPSHOT = {
  account: { id: 1, username: 'gladys_tester', currency: 'EUR' },
  profile: { collection: 1234, wantlist: 56, forSale: 2 },
  value: { min: 3011.15, median: 6128.8, max: 12345.5 },
  readAt: NOW,
};
const credited = (content) =>
  content.components.some((c) => c.type === 'text' && /Discogs/.test(c.text));

test('collection: six tiles, the value rounded, credited, in every language', () => {
  for (const language of LANGUAGES) {
    const content = buildCollectionWidget({ snapshot: SNAPSHOT, language, timeZone: TZ });
    assert.deepEqual(validateWidgetContent(content), [], language);
    const tiles = content.components.filter((c) => c.type === 'value');
    assert.equal(tiles.length, 6);
    assert.equal(tiles[2].value, 6129);
    assert.equal(tiles[2].unit, 'EUR');
    assert.ok(credited(content), language);
  }
  const noValue = buildCollectionWidget({
    snapshot: { ...SNAPSHOT, value: null },
    language: 'en',
    timeZone: TZ,
  });
  assert.equal(noValue.components.filter((c) => c.type === 'value').length, 3);
  assert.equal(tileAmount(12.345), 12.35);
});

test('recent: posters or rows, covers as image keys, a link to the page', () => {
  for (const language of LANGUAGES) {
    for (const display of ['grid', 'list']) {
      for (const [list, releases] of [
        ['collection', COLLECTION],
        ['wantlist', WANTS],
      ]) {
        const content = buildRecentWidget({
          releases,
          list,
          display,
          readAt: NOW,
          language,
          timeZone: TZ,
        });
        assert.deepEqual(validateWidgetContent(content), [], `${language} ${display} ${list}`);
        assert.ok(credited(content));
      }
    }
  }
  const content = buildRecentWidget({
    releases: COLLECTION,
    list: 'collection',
    display: 'grid',
    readAt: NOW,
    language: 'fr',
    timeZone: TZ,
  });
  const [item] = content.components.find((c) => c.type === 'card-list').items;
  assert.equal(item.image, 'dg-1430077-s');
  assert.equal(item.subtitle, 'Darkthrone · 2006');
  assert.equal(item.links[0].url, 'https://www.discogs.com/release/1430077');
  assert.match(item.description, /Ajouté le 06\/09\/2026/);
  const empty = buildRecentWidget({ releases: [], list: 'wantlist', language: 'en' });
  assert.equal(empty.components[0].text, 'The wantlist is empty.');
});

test('random: the large cover, a draw button carrying the folder, a link', () => {
  for (const language of LANGUAGES) {
    const content = buildRandomWidget({
      release: COLLECTION[0],
      folder: 3,
      folderName: 'Vinyles',
      language,
    });
    assert.deepEqual(validateWidgetContent(content), [], language);
  }
  const content = buildRandomWidget({
    release: COLLECTION[0],
    folder: 3,
    folderName: 'Vinyles',
    language: 'en',
  });
  const [draw, link] = content.components.filter((c) => c.type === 'button');
  assert.deepEqual(draw.action, { key: WIDGET_ACTIONS.DRAW, params: { folder: 3 } });
  assert.equal(link.link.url, 'https://www.discogs.com/release/1430077');
  assert.equal(content.components.find((c) => c.type === 'image').key, 'dg-1430077-l');
  const empty = buildRandomWidget({ release: null, folder: 4, folderName: 'CD', language: 'fr' });
  assert.deepEqual(validateWidgetContent(empty), []);
  assert.equal(empty.components[0].text, 'Le dossier CD est vide.');
});

test('settings and image keys', () => {
  assert.equal(readCount(undefined, RECENT_COUNT), RECENT_COUNT.default);
  assert.equal(readCount(40, RECENT_COUNT), RECENT_COUNT.max);
  assert.equal(readCount('0', RECENT_COUNT), RECENT_COUNT.min);
  assert.equal(readOption('nope', LISTS), 'collection');
  assert.equal(readOption('wantlist', LISTS), 'wantlist');
  assert.deepEqual(parseImageKey(imageKeyOf(644773, 'l')), { releaseId: 644773, size: 'l' });
  assert.equal(parseImageKey('dg-644773-x'), null);
  assert.equal(parseImageKey('https://example.com'), null);
  assert.match(imageKeyOf(123456789012, 's'), /^[a-z0-9][a-z0-9-]{0,63}$/);
});
