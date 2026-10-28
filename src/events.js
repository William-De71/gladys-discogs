// -----------------------------------------------------------------------------
// Scene triggers and scene action outputs.
//
// Triggers (one event per record, never a periodic snapshot):
//   - `collection_added`   a record was added to the collection;
//   - `wantlist_added`     a record was added to the wantlist.
// The integration reads the first page of each list, the last added first,
// and compares it to the page of the last reading (`seen` in /data): a copy
// absent from it and added after the oldest copy of it is new. A record
// removed from the list lets an older one move up into the page: its date
// keeps it from passing for new. The first reading of an account is a
// baseline. A bulk import fires MAX_EVENTS events at most per reading.
//
// Outputs of the scene actions: only the declared keys, scalars, with a
// sentence ready for a message (`summary`).
// -----------------------------------------------------------------------------

import { t } from './i18n.js';
import { releaseText } from './releases.js';

const TRIGGERS = { COLLECTION_ADDED: 'collection_added', WANTLIST_ADDED: 'wantlist_added' };
const MAX_EVENTS = 10;
// The formats a trigger can be filtered on (the first format of a release).
const FORMATS = [
  'Vinyl',
  'CD',
  'Cassette',
  'File',
  'CDr',
  'Box Set',
  'DVD',
  'Blu-ray',
  'Shellac',
  'Minidisc',
];

const RELEASE_OUTPUTS = ['release_id', 'title', 'artist', 'year', 'format', 'label', 'url'];
const OUTPUTS = {
  random_release: ['found', ...RELEASE_OUTPUTS, 'folder_name', 'summary'],
  search_barcode: ['found', 'matches', ...RELEASE_OUTPUTS, 'country', 'summary'],
  add_to_collection: [
    'added',
    'already_owned',
    'copies',
    'release_id',
    'title',
    'artist',
    'folder_name',
    'summary',
  ],
  add_to_wantlist: ['release_id', 'title', 'artist', 'summary'],
  remove_from_wantlist: ['removed', 'release_id', 'summary'],
  get_price: ['for_sale', 'lowest_price', 'currency', 'release_id', 'title', 'artist', 'summary'],
  get_collection: [
    'records',
    'wantlist',
    'for_sale',
    'value_min',
    'value_median',
    'value_max',
    'currency',
    'last_added',
    'summary',
  ],
};

/**
 * @description What a list looked like at a reading, kept in /data.
 * @param {object[]} releases - The first page, the last added first.
 * @param {Function} idOf - The id of an entry (instance id or release id).
 * @param {number} perPage - The size of the page.
 * @returns {{ ids: number[], oldestAt: number|null, full: boolean }} The page.
 */
function pageOf(releases, idOf, perPage) {
  const dates = releases.map((release) => release.addedAt).filter(Number.isFinite);
  return {
    ids: releases.map(idOf).filter((id) => id !== null),
    oldestAt: dates.length ? Math.min(...dates) : null,
    full: releases.length >= perPage,
  };
}

/**
 * @description The entries added since the last reading.
 * @param {object|undefined} before - The page of the last reading (pageOf),
 * undefined for the first reading: a baseline, nothing is new.
 * @param {object[]} releases - The first page now, the last added first.
 * @param {Function} idOf - The id of an entry.
 * @returns {object[]} The new entries, the oldest first, MAX_EVENTS at most.
 */
function detectAdditions(before, releases, idOf) {
  if (!before || !Array.isArray(before.ids)) {
    return [];
  }
  const seen = new Set(before.ids);
  return releases
    .filter((release) => {
      const id = idOf(release);
      if (id === null || seen.has(id)) {
        return false;
      }
      // A full page hid the older entries: one moving up into the page after
      // a removal is no addition.
      return !(
        before.full &&
        before.oldestAt !== null &&
        Number.isFinite(release.addedAt) &&
        release.addedAt <= before.oldestAt
      );
    })
    .slice(0, MAX_EVENTS)
    .reverse();
}

/**
 * @description The data of an addition event (flat, scalars).
 * @param {object} release - A parsed release.
 * @param {object} [extra] - `{ folder, folderName }` for the collection.
 * @returns {object} The event data.
 */
function additionData(release, { folder = '', folderName = '' } = {}) {
  return {
    release_id: release.releaseId,
    title: release.title,
    artist: release.artist,
    year: release.year ?? 0,
    format: release.format,
    formats: release.formats,
    label: release.label,
    catno: release.catno,
    genre: release.genre,
    url: release.url,
    cover_url: release.cover || release.thumb,
    ...(folder || folderName ? { folder, folder_name: folderName } : {}),
  };
}

/**
 * @description The common outputs of a release.
 * @param {object|null} release - A parsed release or search result.
 * @returns {object} The outputs, empty values when null.
 */
function releaseOutputs(release) {
  return {
    release_id: release?.releaseId ?? 0,
    title: release?.title ?? '',
    artist: release?.artist ?? '',
    year: release?.year ?? 0,
    format: release?.format ?? '',
    label: release?.label ?? '',
    url: release?.url ?? '',
  };
}

/**
 * @description "Artist – Title (1999, Vinyl)".
 * @param {object} release - A parsed release.
 * @returns {string} The text.
 */
function describe(release) {
  const details = [release.year, release.format].filter(Boolean).join(', ');
  return `${releaseText(release)}${details ? ` (${details})` : ''}`;
}

/**
 * @description An amount with its currency: "12.50 EUR".
 * @param {number|null} amount - The amount.
 * @param {string} currency - The currency.
 * @returns {string} The text.
 */
const moneyText = (amount, currency) =>
  amount === null || amount === undefined
    ? ''
    : `${Number(amount).toFixed(2)}${currency ? ` ${currency}` : ''}`;

/**
 * @description Keep the declared outputs only.
 * @param {object} outputs - The outputs.
 * @param {string[]} keys - The declared keys.
 * @returns {object} The outputs.
 */
const pick = (outputs, keys) =>
  Object.fromEntries(
    keys.filter((key) => outputs[key] !== undefined).map((key) => [key, outputs[key]]),
  );

/**
 * @description The outputs of "a random record".
 * @param {object|null} release - The drawn record.
 * @param {object} options - `{ folderName, language }`.
 * @returns {object} The outputs.
 */
function randomOutputs(release, { folderName, language }) {
  return pick(
    {
      found: Boolean(release),
      ...releaseOutputs(release),
      folder_name: folderName,
      summary: release
        ? t('summaryRandom', language, { release: describe(release) })
        : t('summaryRandomNone', language, { folder: folderName }),
    },
    OUTPUTS.random_release,
  );
}

/**
 * @description The outputs of "search a barcode".
 * @param {object[]} matches - The search results printed with the barcode.
 * @param {object} options - `{ barcode, language }`.
 * @returns {object} The outputs.
 */
function barcodeOutputs(matches, { barcode, language }) {
  const [first] = matches;
  return pick(
    {
      found: Boolean(first),
      matches: matches.length,
      ...releaseOutputs(first ?? null),
      country: first?.country ?? '',
      summary: first
        ? t(matches.length > 1 ? 'summaryBarcodeMany' : 'summaryBarcode', language, {
            barcode,
            release: describe(first),
            count: matches.length,
          })
        : t('summaryBarcodeNone', language, { barcode }),
    },
    OUTPUTS.search_barcode,
  );
}

/**
 * @description The outputs of "add to the collection".
 * @param {object} release - The release.
 * @param {object} options - `{ added, copies, folderName, language }`.
 * @returns {object} The outputs.
 */
function addCollectionOutputs(release, { added, copies, folderName, language }) {
  return pick(
    {
      added,
      already_owned: !added,
      copies,
      release_id: release.releaseId,
      title: release.title,
      artist: release.artist,
      folder_name: folderName,
      summary: t(added ? 'summaryAdded' : 'summaryOwned', language, {
        release: releaseText(release),
        folder: folderName,
        count: copies,
      }),
    },
    OUTPUTS.add_to_collection,
  );
}

/**
 * @description The outputs of "the price of a record".
 * @param {object} release - The release.
 * @param {object} stats - `{ forSale, lowest, currency }`.
 * @param {string} language - The language.
 * @returns {object} The outputs.
 */
function priceOutputs(release, stats, language) {
  return pick(
    {
      for_sale: stats.forSale,
      lowest_price: stats.lowest ?? -1,
      currency: stats.currency,
      release_id: release.releaseId,
      title: release.title,
      artist: release.artist,
      summary:
        stats.forSale > 0 && stats.lowest !== null
          ? t('summaryPrice', language, {
              release: releaseText(release),
              count: stats.forSale,
              price: moneyText(stats.lowest, stats.currency),
            })
          : t('summaryPriceNone', language, { release: releaseText(release) }),
    },
    OUTPUTS.get_price,
  );
}

/**
 * @description The outputs of "my collection".
 * @param {object} snapshot - The last reading of the account.
 * @param {string} language - The language.
 * @returns {object} The outputs.
 */
function collectionOutputs(snapshot, language) {
  const { profile, value, account } = snapshot;
  const currency = account.currency || '';
  return pick(
    {
      records: profile.collection ?? 0,
      wantlist: profile.wantlist ?? 0,
      for_sale: profile.forSale ?? 0,
      value_min: value?.min ?? -1,
      value_median: value?.median ?? -1,
      value_max: value?.max ?? -1,
      currency,
      last_added: snapshot.lastAdded ? releaseText(snapshot.lastAdded) : '',
      summary: t(value ? 'summaryCollection' : 'summaryCollectionNoValue', language, {
        count: profile.collection ?? 0,
        wants: profile.wantlist ?? 0,
        median: moneyText(value?.median ?? null, currency),
        min: moneyText(value?.min ?? null, currency),
        max: moneyText(value?.max ?? null, currency),
      }),
    },
    OUTPUTS.get_collection,
  );
}

export {
  TRIGGERS,
  MAX_EVENTS,
  FORMATS,
  OUTPUTS,
  pageOf,
  detectAdditions,
  additionData,
  releaseOutputs,
  describe,
  moneyText,
  pick,
  randomOutputs,
  barcodeOutputs,
  addCollectionOutputs,
  priceOutputs,
  collectionOutputs,
};
