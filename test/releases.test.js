// Raw answers of Discogs -> the kept fields: artists, formats, money, the
// release a user types, the barcode check.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  artistsText,
  formatsText,
  parseRelease,
  parseFullRelease,
  parseSearchResult,
  parseReleaseInput,
  parseMoney,
  matchesBarcode,
  barcodeDigits,
  releaseText,
} from '../src/releases.js';
import { fixture, BARCODE } from './helpers/fixtures.js';

test('a release of the collection: its catalog data, its copy, its covers', () => {
  const [raw] = fixture('collection.json').releases;
  const release = parseRelease(raw);
  assert.deepEqual(
    {
      releaseId: release.releaseId,
      instanceId: release.instanceId,
      folderId: release.folderId,
      title: release.title,
      artist: release.artist,
      year: release.year,
      format: release.format,
      formats: release.formats,
      label: release.label,
      catno: release.catno,
      genre: release.genre,
      url: release.url,
    },
    {
      releaseId: 1430077,
      instanceId: 2181725729,
      folderId: 3,
      title: 'Too Old Too Cold',
      artist: 'Darkthrone',
      year: 2006,
      format: 'Vinyl',
      formats: 'Vinyl, 12", 45 RPM, Single',
      label: 'Peaceville',
      catno: 'VILELP145',
      genre: 'Rock',
      url: 'https://www.discogs.com/release/1430077',
    },
  );
  assert.equal(release.addedAt, Date.parse('2026-09-06T14:03:12-07:00'));
  assert.match(release.thumb, /^https:\/\/i\.discogs\.com\//);
  assert.match(release.cover, /^https:\/\/i\.discogs\.com\//);
  assert.equal(releaseText(release), 'Darkthrone – Too Old Too Cold');
});

test('a release of the wantlist has no copy; unusable entries are dropped', () => {
  const release = parseRelease(fixture('wants.json').wants[0]);
  assert.equal(release.instanceId, null);
  assert.equal(release.releaseId, 1201588);
  assert.equal(parseRelease({ id: 1 }), null);
  assert.equal(parseRelease(null), null);
});

test('artists: joins, name variations, and no namesake number', () => {
  assert.equal(
    artistsText([
      { name: 'Simon', join: '&' },
      { name: 'Garfunkel', join: '' },
    ]),
    'Simon & Garfunkel',
  );
  assert.equal(artistsText([{ name: 'Butterflies (3)' }]), 'Butterflies');
  assert.equal(
    artistsText([
      { name: 'A', join: ',' },
      { name: 'B', anv: 'Bee' },
    ]),
    'A, Bee',
  );
  assert.equal(artistsText([]), '');
  assert.equal(formatsText([{ name: 'CD', qty: '2', descriptions: ['Album'] }]), '2× CD, Album');
});

test('a full release takes the first image as cover', () => {
  const release = parseFullRelease(fixture('release.json'));
  assert.equal(release.title, 'London Calling');
  assert.equal(release.artist, 'The Clash');
  assert.match(release.cover, /^https:\/\/i\.discogs\.com\//);
  assert.match(release.thumb, /^https:\/\/i\.discogs\.com\//);
});

test('search results: "Artist - Title" split, and only the releases printed with the barcode', () => {
  const { results } = fixture('search.json');
  assert.ok(results.every((result) => matchesBarcode(result, BARCODE)));
  const first = parseSearchResult(results[0]);
  assert.equal(first.artist, 'The Fabulous Ducks');
  assert.equal(first.title, 'Poultry in Motion');
  const loose = fixture('search-unknown.json').results;
  assert.equal(loose.length, 3, 'Discogs answers loose matches for an unknown barcode');
  assert.ok(loose.every((result) => !matchesBarcode(result, '3700000000001')));
  assert.equal(barcodeDigits('0 72435 4'), '724354');
  assert.ok(matchesBarcode({ barcode: ['5 09974 953472 8'] }, '05099749534728'), 'leading zero');
  assert.equal(matchesBarcode({ barcode: ['12345'] }, '12345'), false, 'too short to be a barcode');
});

test('the release a user types: number, r-number, page address', () => {
  assert.equal(parseReleaseInput('644773'), 644773);
  assert.equal(parseReleaseInput(' r644773 '), 644773);
  assert.equal(parseReleaseInput('[r644773]'), 644773);
  assert.equal(
    parseReleaseInput('https://www.discogs.com/fr/release/644773-The-Clash-London-Calling'),
    644773,
  );
  assert.equal(parseReleaseInput('https://www.discogs.com/master/19382'), null);
  assert.equal(parseReleaseInput('London Calling'), null);
  assert.equal(parseReleaseInput(''), null);
  assert.equal(parseReleaseInput('0'), null);
});

test('money: the formatted amounts of Discogs, every currency', () => {
  assert.equal(parseMoney('€1,234.56'), 1234.56);
  assert.equal(parseMoney('$500.00'), 500);
  assert.equal(parseMoney('CA$12.50'), 12.5);
  assert.equal(parseMoney('1.234,56 €'), 1234.56);
  assert.equal(parseMoney('¥12,000'), 12000);
  assert.equal(parseMoney('£0.99'), 0.99);
  assert.equal(parseMoney('R$1.250.000'), 1250000);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney(undefined), null);
  assert.equal(parseMoney(3.5), 3.5);
});
