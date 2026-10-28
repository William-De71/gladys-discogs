// -----------------------------------------------------------------------------
// The devices of the integration, offered on the Discovery screen.
//
//   - "Discogs (<account>)": the account of the token, read-only features:
//       `collection`    the records of the collection (counter-sensor);
//       `wantlist`      the records of the wantlist (counter-sensor);
//       `for_sale`      the records the account sells (counter-sensor);
//       `value_min`, `value_median`, `value_max`
//                       the value of the collection estimated by Discogs from
//                       the sales of the marketplace (currency, in the
//                       currency of the account: € / $ / £ as Gladys units,
//                       no unit for the others);
//       `last_added`    "Artist – Title" of the last record added (text).
//   - "<folder> (Discogs)": one per folder of the collection ("All" aside),
//     with its count of records.
//
// External ids: the numeric id of the Discogs account (never the name, which
// the user can change), and for a folder the account id and the folder id
// (`ext:discogs:folder:123456_7`). `should_poll` stays false: the
// integration reads the account on its own timer.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { t } from './i18n.js';
import { releaseText } from './releases.js';

const DEVICE_TYPES = { ACCOUNT: 'account', FOLDER: 'folder' };
const FEATURE_KEYS = {
  COLLECTION: 'collection',
  WANTLIST: 'wantlist',
  FOR_SALE: 'for_sale',
  VALUE_MIN: 'value_min',
  VALUE_MEDIAN: 'value_median',
  VALUE_MAX: 'value_max',
  LAST_ADDED: 'last_added',
  COUNT: 'count',
};
const MAX_COUNT = 10000000;
const MAX_VALUE = 1000000000;
const MAX_FOLDERS = 50;
// The currencies Gladys has a unit for.
const CURRENCY_UNITS = {
  EUR: DEVICE_FEATURE_UNITS.EURO,
  USD: DEVICE_FEATURE_UNITS.DOLLAR,
  GBP: DEVICE_FEATURE_UNITS.POUND_STERLING,
};

/**
 * @description The external ids of the account device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {number} accountId - The Discogs account id.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const accountIds = (gladys, accountId) =>
  gladys.externalIds(DEVICE_TYPES.ACCOUNT, String(accountId));

/**
 * @description The external ids of a folder device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {number} accountId - The Discogs account id.
 * @param {number} folderId - The folder id.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const folderIds = (gladys, accountId, folderId) =>
  gladys.externalIds(DEVICE_TYPES.FOLDER, `${accountId}_${folderId}`);

/**
 * @description The folder a device (or feature) external id stands for.
 * @param {unknown} externalId - An external id.
 * @returns {{ accountId: number, folderId: number }|null} The folder.
 * @example
 * parseFolderId('ext:discogs:folder:123456_7'); // -> { accountId: 123456, folderId: 7 }
 */
function parseFolderId(externalId) {
  const match = /:folder:(\d+)_(\d+)(?::[a-z_]+)?$/.exec(String(externalId ?? ''));
  return match ? { accountId: Number(match[1]), folderId: Number(match[2]) } : null;
}

const sensor = (feature) => ({
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...feature,
});

const counter = (name, externalId) =>
  sensor({
    name,
    external_id: externalId,
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    min: 0,
    max: MAX_COUNT,
  });

const money = (name, externalId, currency) =>
  sensor({
    name,
    external_id: externalId,
    category: DEVICE_FEATURE_CATEGORIES.CURRENCY,
    type: DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL,
    ...(CURRENCY_UNITS[currency] ? { unit: CURRENCY_UNITS[currency] } : {}),
    min: 0,
    max: MAX_VALUE,
  });

/**
 * @description Build the device of the account.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} account - `{ id, username, currency }`.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildAccountDevice(gladys, account, language = 'en') {
  const ids = accountIds(gladys, account.id);
  const name = (key) => t(key, language, { currency: account.currency || '' }).trim();
  return {
    name: t('accountDeviceName', language, { username: account.username }),
    external_id: ids.device,
    model: 'Discogs',
    should_poll: false,
    params: [{ name: 'DISCOGS_USERNAME', value: account.username }],
    features: [
      counter(name('featureCollection'), ids.feature(FEATURE_KEYS.COLLECTION)),
      counter(name('featureWantlist'), ids.feature(FEATURE_KEYS.WANTLIST)),
      counter(name('featureForSale'), ids.feature(FEATURE_KEYS.FOR_SALE)),
      money(name('featureValueMin'), ids.feature(FEATURE_KEYS.VALUE_MIN), account.currency),
      money(name('featureValueMedian'), ids.feature(FEATURE_KEYS.VALUE_MEDIAN), account.currency),
      money(name('featureValueMax'), ids.feature(FEATURE_KEYS.VALUE_MAX), account.currency),
      sensor({
        name: name('featureLastAdded'),
        external_id: ids.feature(FEATURE_KEYS.LAST_ADDED),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        keep_history: false,
        min: 0,
        max: 0,
      }),
    ],
  };
}

/**
 * @description Build the device of a folder.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {number} accountId - The Discogs account id.
 * @param {object} folder - `{ id, name, count }`.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildFolderDevice(gladys, accountId, folder, language = 'en') {
  const ids = folderIds(gladys, accountId, folder.id);
  return {
    name: t('folderDeviceName', language, { folder: folder.name }),
    external_id: ids.device,
    model: 'Discogs',
    should_poll: false,
    params: [{ name: 'DISCOGS_FOLDER', value: String(folder.id) }],
    features: [counter(t('featureFolderCount', language), ids.feature(FEATURE_KEYS.COUNT))],
  };
}

/**
 * @description The folders offered as devices: every folder but "All" (id 0).
 * @param {object[]} folders - `[{ id, name, count }]`.
 * @returns {object[]} The folders, MAX_FOLDERS at most.
 */
const deviceFolders = (folders) =>
  folders.filter((folder) => folder.id !== 0).slice(0, MAX_FOLDERS);

/**
 * @description The states of the account.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} snapshot - `{ account, profile: { collection, wantlist,
 * forSale }, value: { min, median, max } | null, lastAdded | null }`.
 * @returns {Array<object>} The states, the unknown ones left out.
 */
function buildAccountStates(gladys, snapshot) {
  const ids = accountIds(gladys, snapshot.account.id);
  const states = [];
  const number = (key, value, max) => {
    if (Number.isFinite(value) && value >= 0) {
      states.push({ device_feature_external_id: ids.feature(key), state: Math.min(max, value) });
    }
  };
  number(FEATURE_KEYS.COLLECTION, snapshot.profile.collection, MAX_COUNT);
  number(FEATURE_KEYS.WANTLIST, snapshot.profile.wantlist, MAX_COUNT);
  number(FEATURE_KEYS.FOR_SALE, snapshot.profile.forSale, MAX_COUNT);
  if (snapshot.value) {
    number(FEATURE_KEYS.VALUE_MIN, snapshot.value.min, MAX_VALUE);
    number(FEATURE_KEYS.VALUE_MEDIAN, snapshot.value.median, MAX_VALUE);
    number(FEATURE_KEYS.VALUE_MAX, snapshot.value.max, MAX_VALUE);
  }
  if (snapshot.lastAdded) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_KEYS.LAST_ADDED),
      text: releaseText(snapshot.lastAdded).slice(0, 250),
    });
  }
  return states;
}

/**
 * @description The states of the folders.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {number} accountId - The Discogs account id.
 * @param {object[]} folders - `[{ id, count }]`.
 * @returns {Array<object>} The states.
 */
function buildFolderStates(gladys, accountId, folders) {
  return deviceFolders(folders)
    .filter((folder) => Number.isFinite(folder.count))
    .map((folder) => ({
      device_feature_external_id: folderIds(gladys, accountId, folder.id).feature(
        FEATURE_KEYS.COUNT,
      ),
      state: Math.min(MAX_COUNT, folder.count),
    }));
}

export {
  DEVICE_TYPES,
  FEATURE_KEYS,
  MAX_COUNT,
  MAX_VALUE,
  MAX_FOLDERS,
  CURRENCY_UNITS,
  accountIds,
  folderIds,
  parseFolderId,
  deviceFolders,
  buildAccountDevice,
  buildFolderDevice,
  buildAccountStates,
  buildFolderStates,
};
