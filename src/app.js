// -----------------------------------------------------------------------------
// The Discogs integration: every handler, registered on a Gladys client.
//
// Brings a Discogs account into Gladys, through the official API and the
// user's personal access token:
//   - devices (device.js): the account — records in the collection, in the
//     wantlist, for sale, value of the collection, last record added — and
//     one per folder of the collection with its count;
//   - scene triggers (events.js): a record added to the collection, a record
//     added to the wantlist;
//   - scene actions: a random record, search a barcode, add a record to the
//     collection, add it to / remove it from the wantlist, the price of a
//     record on the marketplace, the collection in a sentence;
//   - dashboard widgets (widgets.js): collection, recent additions, random
//     record (with its cover, through onWidgetGetImage).
//
// The API has no push: the account is read on the integration's own timer
// (every 15 min to 3 h, 30 min by default), five requests per reading, never
// on a Gladys poll. Transport: cloud only.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK and a fake API (test/app.test.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, readLanguage, INTERNAL_KEYS, AUTO, AUTO_LANGUAGE } from './config.js';
import { createDiscogsClient, MAX_IMAGE_BYTES } from './discogs-api.js';
import {
  parseRelease,
  parseFullRelease,
  parseSearchResult,
  parseReleaseInput,
  parseMoney,
  matchesBarcode,
  barcodeDigits,
  releaseText,
} from './releases.js';
import { createStore, DEFAULT_PATH } from './store.js';
import { parseImageKey, SIZES } from './images.js';
import {
  accountIds,
  folderIds,
  parseFolderId,
  deviceFolders,
  buildAccountDevice,
  buildFolderDevice,
  buildAccountStates,
  buildFolderStates,
} from './device.js';
import {
  TRIGGERS,
  OUTPUTS,
  pageOf,
  detectAdditions,
  additionData,
  pick,
  randomOutputs,
  barcodeOutputs,
  addCollectionOutputs,
  priceOutputs,
  collectionOutputs,
} from './events.js';
import {
  WIDGETS,
  WIDGET_ACTIONS,
  RECENT_COUNT,
  LISTS,
  DISPLAYS,
  readCount,
  readOption,
  messageContent,
  buildCollectionWidget,
  buildRecentWidget,
  buildRandomWidget,
} from './widgets.js';
import { t, all, LANGUAGES } from './i18n.js';

const ACTIONS = { TEST_CONNECTION: 'test_connection', DIAGNOSTIC: 'diagnostic' };
const SCENE_ACTIONS = {
  RANDOM_RELEASE: 'random_release',
  SEARCH_BARCODE: 'search_barcode',
  ADD_TO_COLLECTION: 'add_to_collection',
  ADD_TO_WANTLIST: 'add_to_wantlist',
  REMOVE_FROM_WANTLIST: 'remove_from_wantlist',
  GET_PRICE: 'get_price',
  GET_COLLECTION: 'get_collection',
};
const MINUTE_MS = 60 * 1000;
// The first page of each list: enough to see the additions between two
// readings, and the "recent" widget.
const PAGE_SIZE = 25;
// A widget or a scene action reuses a reading of less than 5 min.
const SNAPSHOT_MAX_AGE_MS = 5 * MINUTE_MS;
const RETRY_MS = 5 * MINUTE_MS;
// "Uncategorized", the folder Discogs adds records to by default.
const UNCATEGORIZED = 1;
const DIAGNOSTIC_CHUNK = 3000;
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/**
 * @description Create the integration on a Gladys client.
 * @param {object} gladys - The GladysIntegration instance (or the fake one).
 * @param {object} [options] - `{ fetch, baseUrl, storePath, now, sleep,
 * random, timeZone, timers, logger }` (the tests set them).
 * @returns {object} Helpers for the tests.
 */
function createApp(
  gladys,
  {
    fetch: fetchFn,
    baseUrl,
    storePath = DEFAULT_PATH,
    now = () => Date.now(),
    sleep,
    random = Math.random,
    timeZone,
    timers = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`.
  let language = 'en';
  let createdDevices = new Set();
  // The account of the token: `{ id, username, currency }`.
  let account = null;
  // The last reading: `{ account, profile, value, folders, collection, wants,
  // lastAdded, readAt }`.
  let snapshot = null;
  let reading = null;
  let lastError = null;
  let lastStatus = null;
  let lastDiscovery = null;
  let readTimer = null;
  let retryTimer = null;
  let stopped = false;

  const api = createDiscogsClient({
    now,
    ...(fetchFn ? { fetch: fetchFn } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(sleep ? { sleep } : {}),
  });
  const store = createStore({ path: storePath, logger });

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language.
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description The message of an error, for a user.
   * @param {Error} err - The error.
   * @param {string} lang - The language.
   * @returns {string} The message.
   */
  function errorText(err, lang) {
    switch (err?.kind) {
      case 'token':
        return t(config.token ? 'errorToken' : 'statusNoToken', lang);
      case 'quota':
        return t('errorQuota', lang);
      case 'notFound':
        return t('errorNotFound', lang);
      case 'forbidden':
        return t('errorForbidden', lang);
      default:
        return t('errorUnreachable', lang, { detail: String(err?.message ?? '').slice(0, 80) });
    }
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description Work out the connection status from the last reading.
   * @returns {Promise<void>}
   */
  async function refreshStatus() {
    if (!config.token) {
      await reportStatus(false, all('statusNoToken'));
      return;
    }
    if (lastError) {
      await reportStatus(
        false,
        Object.fromEntries(LANGUAGES.map((l) => [l, errorText(lastError, l)])),
      );
      return;
    }
    if (snapshot) {
      await reportStatus(
        true,
        all('statusConnected', {
          username: snapshot.account.username,
          count: snapshot.profile.collection ?? 0,
          minutes: Math.round(config.interval / 60),
        }),
      );
    }
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Ask the open widgets to pull their content again.
   * @param {string[]} keys - The widget keys.
   */
  function refreshWidgets(keys) {
    for (const key of keys) {
      Promise.resolve(gladys.requestWidgetRefresh(key)).catch(() => {});
    }
  }

  // --- Reading -----------------------------------------------------------------------

  /**
   * @description The account of the token, read once per token.
   * @returns {Promise<object>} `{ id, username, currency }`.
   */
  async function resolveAccount() {
    if (!account) {
      const identity = await api.identity();
      const id = Number(identity?.id);
      if (!Number.isSafeInteger(id) || typeof identity?.username !== 'string') {
        throw Object.assign(new Error('No account in the identity answer'), { kind: 'invalid' });
      }
      account = { id, username: identity.username, currency: '' };
    }
    return account;
  }

  /**
   * @description Read the account: profile, folders, value, the first page of
   * the collection and of the wantlist.
   * @returns {Promise<object>} The snapshot.
   */
  async function readAccount() {
    const current = await resolveAccount();
    const profile = await api.profile(current.username);
    // The name may change on Discogs: the id stays.
    current.username = typeof profile.username === 'string' ? profile.username : current.username;
    current.currency = /^[A-Z]{3}$/.test(profile.curr_abbr ?? '') ? profile.curr_abbr : '';
    const folders = (await api.folders(current.username))
      .map((folder) => ({
        id: Number(folder.id),
        name: String(folder.name ?? '').slice(0, 80),
        count: Number.isFinite(Number(folder.count)) ? Number(folder.count) : null,
      }))
      .filter((folder) => Number.isSafeInteger(folder.id));
    let value = null;
    try {
      const raw = await api.value(current.username);
      const min = parseMoney(raw?.minimum);
      const median = parseMoney(raw?.median);
      const max = parseMoney(raw?.maximum);
      value = median === null ? null : { min: min ?? median, median, max: max ?? median };
    } catch (err) {
      if (err.kind !== 'forbidden' && err.kind !== 'notFound') {
        throw err;
      }
    }
    const collection = (await api.collection(current.username, { perPage: PAGE_SIZE })).releases
      .map(parseRelease)
      .filter(Boolean);
    const wants = (await api.wants(current.username, { perPage: PAGE_SIZE })).wants
      .map(parseRelease)
      .filter(Boolean);
    const all0 = folders.find((folder) => folder.id === 0);
    return {
      account: { ...current },
      profile: {
        collection: Number.isFinite(profile.num_collection)
          ? profile.num_collection
          : (all0?.count ?? null),
        wantlist: Number.isFinite(profile.num_wantlist) ? profile.num_wantlist : null,
        forSale: Number.isFinite(profile.num_for_sale) ? profile.num_for_sale : null,
      },
      value,
      folders,
      collection,
      wants,
      lastAdded: collection[0] ?? null,
      readAt: now(),
    };
  }

  /**
   * @description Offer the devices on the Discovery screen, when they changed.
   * @param {boolean} [force] - Publish even when unchanged.
   * @returns {Promise<number>} How many devices were offered.
   */
  async function publishDiscoveredDevices(force = false) {
    if (!snapshot) {
      return 0;
    }
    const lang = textLanguage();
    const devices = [
      buildAccountDevice(gladys, snapshot.account, lang),
      ...deviceFolders(snapshot.folders).map((folder) =>
        buildFolderDevice(gladys, snapshot.account.id, folder, lang),
      ),
    ];
    const signature = JSON.stringify(devices);
    if (!force && signature === lastDiscovery) {
      return devices.length;
    }
    try {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    } catch (err) {
      logger.error('Unable to publish the discovered devices', err);
    }
    return devices.length;
  }

  /**
   * @description Publish the states of the created devices that changed.
   * @returns {Promise<void>}
   */
  async function publishStates() {
    if (!snapshot) {
      return;
    }
    const { id } = snapshot.account;
    const states = [];
    if (createdDevices.has(accountIds(gladys, id).device)) {
      states.push(...buildAccountStates(gladys, snapshot));
    }
    states.push(
      ...buildFolderStates(
        gladys,
        id,
        snapshot.folders.filter((folder) =>
          createdDevices.has(folderIds(gladys, id, folder.id).device),
        ),
      ),
    );
    if (states.length === 0) {
      return;
    }
    try {
      await gladys.publishChangedStates(states, { heartbeat: 30 * MINUTE_MS });
    } catch (err) {
      logger.warn(`Unable to publish the states: ${err.message}`);
    }
  }

  /**
   * @description The name of a folder.
   * @param {number} folderId - The folder.
   * @returns {string} Its name, "All" for 0.
   */
  function folderName(folderId) {
    const folder = snapshot?.folders.find((entry) => entry.id === folderId);
    return folder?.name ?? (folderId === 0 ? 'All' : String(folderId));
  }

  /**
   * @description Fire the events of the additions since the last reading,
   * and remember the new first pages.
   * @returns {Promise<void>}
   */
  async function fireEvents() {
    const key = String(snapshot.account.id);
    const before = store.data.seen[key] ?? null;
    const instanceOf = (release) => release.instanceId;
    const releaseOf = (release) => release.releaseId;
    const events = [];
    for (const release of detectAdditions(before?.collection, snapshot.collection, instanceOf)) {
      const folder =
        release.folderId !== null && release.folderId !== 0
          ? folderIds(gladys, snapshot.account.id, release.folderId).device
          : '';
      events.push({
        key: TRIGGERS.COLLECTION_ADDED,
        data: additionData(release, { folder, folderName: folderName(release.folderId ?? 0) }),
      });
    }
    for (const release of detectAdditions(before?.wants, snapshot.wants, releaseOf)) {
      events.push({ key: TRIGGERS.WANTLIST_ADDED, data: additionData(release) });
    }
    store.data.seen[key] = {
      collection: pageOf(snapshot.collection, instanceOf, PAGE_SIZE),
      wants: pageOf(snapshot.wants, releaseOf, PAGE_SIZE),
    };
    for (const release of [...snapshot.collection, ...snapshot.wants]) {
      store.rememberCover(release);
    }
    await store.save();
    for (const { key: trigger, data } of events) {
      logger.info(`${trigger}: ${data.artist} – ${data.title}`);
      try {
        await gladys.publishSceneEvent(trigger, data);
      } catch (err) {
        logger.warn(`Unable to fire ${trigger}: ${err.message}`);
      }
    }
  }

  /**
   * @description Read the account, then publish devices, states and events.
   * Concurrent calls share one reading.
   * @returns {Promise<object|null>} The snapshot, null on failure.
   */
  function read() {
    if (!reading) {
      reading = (async () => {
        try {
          if (!config.token) {
            snapshot = null;
            lastError = null;
            return null;
          }
          snapshot = await readAccount();
          lastError = null;
          await publishDiscoveredDevices();
          await publishStates();
          await fireEvents();
          refreshWidgets(Object.values(WIDGETS));
          return snapshot;
        } catch (err) {
          logger.warn(`Unable to read Discogs (${err.kind ?? 'error'}): ${err.message}`);
          lastError = err;
          if (err.kind === 'token') {
            account = null;
          }
          if (!snapshot && timers && !stopped && err.kind !== 'token') {
            clearTimeout(retryTimer);
            retryTimer = setTimeout(() => {
              read().catch(() => {});
            }, RETRY_MS);
            retryTimer.unref?.();
          }
          return null;
        } finally {
          reading = null;
          await refreshStatus();
        }
      })();
    }
    return reading;
  }

  /**
   * @description The last reading, read again when older than a bound.
   * @param {number} [maxAge] - The bound, in milliseconds.
   * @returns {Promise<object>} The snapshot.
   * @throws {Error} When no token is set or the API fails.
   */
  async function freshSnapshot(maxAge = SNAPSHOT_MAX_AGE_MS) {
    if (snapshot && now() - snapshot.readAt < maxAge) {
      return snapshot;
    }
    const current = await read();
    if (current) {
      return current;
    }
    throw lastError ?? Object.assign(new Error('No personal access token'), { kind: 'token' });
  }

  /**
   * @description Apply the configuration: read the account, set the timer.
   * @returns {Promise<void>}
   */
  async function applyConfig() {
    clearInterval(readTimer);
    clearTimeout(retryTimer);
    if (api.token !== config.token) {
      api.token = config.token;
      account = null;
      snapshot = null;
    }
    lastDiscovery = null;
    await read();
    if (timers && !stopped) {
      readTimer = setInterval(() => {
        read().catch(() => {});
      }, config.interval * 1000);
      readTimer.unref?.();
    }
  }

  /**
   * @description The folder a scene field or a widget setting stands for.
   * @param {unknown} externalId - A folder device external id, empty for none.
   * @param {number} fallback - The folder when empty.
   * @returns {number} The folder id.
   * @throws {Error} For a device of another account.
   */
  function folderOf(externalId, fallback) {
    if (!externalId) {
      return fallback;
    }
    const folder = parseFolderId(externalId);
    if (!folder || (snapshot && folder.accountId !== snapshot.account.id)) {
      throw new Error('The folder device belongs to another Discogs account');
    }
    return folder.folderId;
  }

  /**
   * @description The release a scene field stands for.
   * @param {unknown} raw - "644773", "r644773" or the address of its page.
   * @returns {number} The release id.
   * @throws {Error} When it is none of them.
   */
  function releaseOf(raw) {
    const id = parseReleaseInput(raw);
    if (!id) {
      throw new Error(`Not a Discogs release: ${String(raw ?? '').slice(0, 60)}`);
    }
    return id;
  }

  /**
   * @description A release known from the last reading, else read from the API.
   * @param {number} releaseId - The release.
   * @returns {Promise<object>} The parsed release.
   */
  async function releaseInfo(releaseId) {
    const known = [...(snapshot?.collection ?? []), ...(snapshot?.wants ?? [])].find(
      (release) => release.releaseId === releaseId,
    );
    if (known) {
      return known;
    }
    const release = parseFullRelease(await api.release(releaseId));
    if (!release) {
      throw new Error(`Unreadable release ${releaseId}`);
    }
    if (store.rememberCover(release)) {
      await store.save();
    }
    return release;
  }

  /**
   * @description Draw a record of a folder at random: one request, a page of
   * one record at a random position.
   * @param {number} folderId - The folder (0 for the whole collection).
   * @returns {Promise<object|null>} The record, null when the folder is empty.
   */
  async function drawRelease(folderId) {
    const current = await freshSnapshot();
    const folder = current.folders.find((entry) => entry.id === folderId);
    if (!folder) {
      throw new Error(`Unknown folder ${folderId}`);
    }
    if (!folder.count) {
      return null;
    }
    const position = 1 + Math.floor(random() * folder.count);
    const page = await api.collection(current.account.username, {
      folder: folderId,
      page: Math.min(position, folder.count),
      perPage: 1,
    });
    const release = parseRelease(page.releases[0]) ?? null;
    if (release && store.rememberCover(release)) {
      await store.save();
    }
    return release;
  }

  /**
   * @description The currency of the marketplace prices.
   * @returns {string} "EUR", '' for the account's.
   */
  const marketCurrency = () =>
    config.currency === AUTO ? (account?.currency ?? '') : config.currency;

  // --- Widgets -----------------------------------------------------------------------

  /**
   * @description A widget content for an error.
   * @param {Error} err - The error.
   * @param {string} lang - The language.
   * @returns {object} The content.
   */
  function errorContent(err, lang) {
    if (!config.token) {
      return messageContent(t('statusNoToken', lang));
    }
    logger.warn(`Widget: ${err.message}`);
    return messageContent(errorText(err, lang), 60);
  }

  gladys.onWidgetGet(WIDGETS.COLLECTION, async ({ language: lang }) => {
    rememberLanguage(lang);
    try {
      return buildCollectionWidget({ snapshot: await freshSnapshot(), language: lang, timeZone });
    } catch (err) {
      return errorContent(err, lang);
    }
  });

  gladys.onWidgetGet(WIDGETS.RECENT, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    try {
      const current = await freshSnapshot();
      const list = readOption(settings.list, LISTS);
      const releases = list === 'wantlist' ? current.wants : current.collection;
      return buildRecentWidget({
        releases: releases.slice(0, readCount(settings.count, RECENT_COUNT)),
        list,
        display: readOption(settings.display, DISPLAYS),
        readAt: current.readAt,
        language: lang,
        timeZone,
      });
    } catch (err) {
      return errorContent(err, lang);
    }
  });

  gladys.onWidgetGet(WIDGETS.RANDOM, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    try {
      const folder = folderOf(settings.folder, 0);
      const key = String(folder);
      let release = store.data.picks[key] ?? null;
      if (!release) {
        release = await drawRelease(folder);
        if (release) {
          store.data.picks[key] = release;
          await store.save();
        }
      }
      return buildRandomWidget({ release, folder, folderName: folderName(folder), language: lang });
    } catch (err) {
      return errorContent(err, lang);
    }
  });

  gladys.onWidgetAction(WIDGETS.RANDOM, async (actionKey, params = {}) => {
    if (actionKey !== WIDGET_ACTIONS.DRAW) {
      throw new Error(`Unknown widget action ${actionKey}`);
    }
    const folder = Number.isSafeInteger(Number(params.folder)) ? Number(params.folder) : 0;
    try {
      const release = await drawRelease(folder);
      if (!release) {
        return all('toastEmpty', { folder: folderName(folder) });
      }
      store.data.picks[String(folder)] = release;
      await store.save();
      return all('toastDrawn', { release: releaseText(release).slice(0, 150) });
    } catch (err) {
      return Object.fromEntries(LANGUAGES.map((l) => [l, errorText(err, l).slice(0, 200)]));
    }
  });

  // Image keys carry the release they stand for (images.js): the handler only
  // ever reads a cover of the image host of Discogs.
  gladys.onWidgetGetImage(async (imageKey) => {
    const parsed = parseImageKey(imageKey);
    if (!parsed) {
      throw new Error(`Unknown image key: ${imageKey}`);
    }
    let covers = store.data.covers[String(parsed.releaseId)];
    if (!covers) {
      const release = await releaseInfo(parsed.releaseId);
      covers = { thumb: release.thumb, cover: release.cover };
    }
    const urls =
      parsed.size === SIZES.large ? [covers.cover, covers.thumb] : [covers.thumb, covers.cover];
    let lastFailure = null;
    for (const url of urls.filter(Boolean)) {
      try {
        const bytes = await api.image(url);
        if (bytes.length <= MAX_IMAGE_BYTES) {
          return bytes.toString('base64');
        }
      } catch (err) {
        lastFailure = err;
      }
    }
    throw lastFailure ?? new Error(`No cover for release ${parsed.releaseId}`);
  });

  // --- Scene actions -----------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.RANDOM_RELEASE, async (fields = {}) => {
    const folder = folderOf(fields.folder, 0);
    const release = await drawRelease(folder);
    return randomOutputs(release, { folderName: folderName(folder), language: textLanguage() });
  });

  gladys.onSceneAction(SCENE_ACTIONS.SEARCH_BARCODE, async (fields = {}) => {
    const barcode = barcodeDigits(fields.barcode);
    if (barcode.length < 6) {
      throw new Error('A barcode has at least 6 digits');
    }
    const shown = String(fields.barcode).replace(/\D/g, '');
    const results = await api.searchBarcode(shown);
    const matches = results
      .filter((result) => matchesBarcode(result, barcode))
      .map(parseSearchResult)
      .filter(Boolean)
      // The pressing most owned first: the one the user most likely holds.
      .sort((a, b) => b.have - a.have);
    return barcodeOutputs(matches, { barcode: shown, language: textLanguage() });
  });

  gladys.onSceneAction(SCENE_ACTIONS.ADD_TO_COLLECTION, async (fields = {}) => {
    const releaseId = releaseOf(fields.release);
    const current = await freshSnapshot();
    const folder = folderOf(fields.folder, UNCATEGORIZED);
    const { username } = current.account;
    const copies = await api.copies(username, releaseId);
    const release = await releaseInfo(releaseId);
    const lang = textLanguage();
    // Idempotent by default: a scene run twice adds one copy.
    if (copies.length > 0 && fields.allow_duplicate !== true) {
      return addCollectionOutputs(release, {
        added: false,
        copies: copies.length,
        folderName: folderName(Number(copies[0].folder_id ?? folder)),
        language: lang,
      });
    }
    const added = await api.addToCollection(username, folder, releaseId);
    // Never an event for what a scene did: the copy is already "seen".
    const seen = store.data.seen[String(current.account.id)];
    const instanceId = Number(added?.instance_id);
    if (seen?.collection && Number.isSafeInteger(instanceId)) {
      seen.collection.ids.unshift(instanceId);
      await store.save();
    }
    return addCollectionOutputs(release, {
      added: true,
      copies: copies.length + 1,
      folderName: folderName(folder),
      language: lang,
    });
  });

  gladys.onSceneAction(SCENE_ACTIONS.ADD_TO_WANTLIST, async (fields = {}) => {
    const releaseId = releaseOf(fields.release);
    const current = await freshSnapshot();
    await api.addWant(current.account.username, releaseId);
    const seen = store.data.seen[String(current.account.id)];
    if (seen?.wants && !seen.wants.ids.includes(releaseId)) {
      seen.wants.ids.unshift(releaseId);
      await store.save();
    }
    const release = await releaseInfo(releaseId);
    return pick(
      {
        release_id: releaseId,
        title: release.title,
        artist: release.artist,
        summary: t('summaryWanted', textLanguage(), { release: releaseText(release) }),
      },
      OUTPUTS.add_to_wantlist,
    );
  });

  gladys.onSceneAction(SCENE_ACTIONS.REMOVE_FROM_WANTLIST, async (fields = {}) => {
    const releaseId = releaseOf(fields.release);
    const current = await freshSnapshot();
    const removed = await api.removeWant(current.account.username, releaseId);
    return pick(
      {
        removed,
        release_id: releaseId,
        summary: t(removed ? 'summaryUnwanted' : 'summaryNotWanted', textLanguage(), {
          id: releaseId,
        }),
      },
      OUTPUTS.remove_from_wantlist,
    );
  });

  gladys.onSceneAction(SCENE_ACTIONS.GET_PRICE, async (fields = {}) => {
    const releaseId = releaseOf(fields.release);
    await freshSnapshot();
    const stats = await api.marketStats(releaseId, marketCurrency());
    const release = await releaseInfo(releaseId);
    const lowest = Number(stats?.lowest_price?.value);
    return priceOutputs(
      release,
      {
        forSale: Number.isFinite(stats?.num_for_sale) ? stats.num_for_sale : 0,
        lowest: Number.isFinite(lowest) && stats?.lowest_price ? lowest : null,
        currency: String(stats?.lowest_price?.currency ?? marketCurrency() ?? ''),
      },
      textLanguage(),
    );
  });

  gladys.onSceneAction(SCENE_ACTIONS.GET_COLLECTION, async () =>
    collectionOutputs(await freshSnapshot(), textLanguage()),
  );

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!config.token) {
      return all('statusNoToken');
    }
    account = null;
    const current = await read();
    if (!current) {
      return Object.fromEntries(LANGUAGES.map((l) => [l, errorText(lastError, l)]));
    }
    return all('testOk', {
      username: current.account.username,
      count: current.profile.collection ?? 0,
      wants: current.profile.wantlist ?? 0,
      folders: deviceFolders(current.folders).length,
      last: current.lastAdded ? releaseText(current.lastAdded).slice(0, 120) : '—',
    });
  });

  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    const report = {
      version: VERSION,
      config: { ...config, token: config.token ? `…${config.token.slice(-4)}` : '' },
      account,
      readAt: snapshot ? new Date(snapshot.readAt).toISOString() : null,
      profile: snapshot?.profile ?? null,
      value: snapshot?.value ?? null,
      folders: snapshot?.folders ?? null,
      collection: snapshot?.collection.slice(0, 5).map(releaseText) ?? null,
      wants: snapshot?.wants.slice(0, 5).map(releaseText) ?? null,
      created: [...createdDevices],
      seen: store.data.seen,
      covers: Object.keys(store.data.covers).length,
      picks: Object.keys(store.data.picks),
      error: lastError ? { kind: lastError.kind, message: lastError.message } : null,
      requests: api.requests,
      quota: api.quota,
    };
    const json = JSON.stringify(report);
    const count = Math.max(1, Math.ceil(json.length / DIAGNOSTIC_CHUNK));
    for (let chunk = 0; chunk < count; chunk += 1) {
      logger.info(
        `Discogs diagnostic ${chunk + 1}/${count}: ${json.slice(chunk * DIAGNOSTIC_CHUNK, (chunk + 1) * DIAGNOSTIC_CHUNK)}`,
      );
    }
    return all('diagnosticDone', { count });
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await read();
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishStates();
    refreshWidgets(Object.values(WIDGETS));
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (raw) => {
    await loadConfig(raw);
    logger.info('Configuration updated');
    await applyConfig();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each (re)connection resynchronizes; the promise lets the tests wait for it.
  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      await loadConfig();
      await store.load();
      await refreshCreatedDevices();
      lastStatus = null;
      await applyConfig();
    })().catch((err) => logger.error('Startup', err));
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    clearInterval(readTimer);
    clearTimeout(retryTimer);
    await store.save();
  });

  return {
    store,
    api,
    read,
    applyConfig,
    getConfig: () => config,
    getAccount: () => account,
    getSnapshot: () => snapshot,
    whenReady: () => startup,
  };
}

export { createApp, ACTIONS, SCENE_ACTIONS, PAGE_SIZE, SNAPSHOT_MAX_AGE_MS, UNCATEGORIZED };
