// -----------------------------------------------------------------------------
// HTTP client of the Discogs API (https://www.discogs.com/developers), the
// official REST API of Discogs, authenticated with the user's personal access
// token (Settings → Developers → "Generate new token").
//
// End points used:
//   GET    /oauth/identity                           the account of the token
//   GET    /users/<u>                                counts, currency of the account
//   GET    /users/<u>/collection/folders             folders and their counts
//   GET    /users/<u>/collection/value               min / median / max value
//   GET    /users/<u>/collection/folders/<f>/releases?sort=added&sort_order=desc
//   GET    /users/<u>/collection/releases/<r>        the copies of one release
//   POST   /users/<u>/collection/folders/<f>/releases/<r>   add a copy
//   GET    /users/<u>/wants?sort=added&sort_order=desc
//   PUT    /users/<u>/wants/<r>                      add to the wantlist
//   DELETE /users/<u>/wants/<r>                      remove from it
//   GET    /database/search?barcode=…&type=release
//   GET    /marketplace/stats/<r>?curr_abbr=…        lowest price, copies for sale
//   GET    /releases/<r>                             one release (covers)
//
// Rate limit: 60 requests per minute with a token, a moving window of one
// minute (`X-Discogs-Ratelimit`, `-Remaining`, `-Used`); 429 beyond. The
// client sends its requests one at a time, at least REQUEST_GAP_MS apart,
// waits for the window when the remaining count reaches 0 and sends nothing
// for a minute after a 429. Every request carries a User-Agent naming the
// integration, as the terms of the API ask.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const BASE_URL = process.env.DISCOGS_API_URL || 'https://api.discogs.com';
const TIMEOUT_MS = 20000;
const REQUEST_GAP_MS = 1100;
const WINDOW_MS = 60 * 1000;
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const USER_AGENT = `gladys-discogs/${version} +https://github.com/William-De71/gladys-discogs`;
// Covers are only ever read from the image host of Discogs.
const IMAGE_HOST = 'i.discogs.com';
const MAX_IMAGE_BYTES = 300 * 1024;
const USERNAME = /^[A-Za-z0-9._-]{1,64}$/;

class DiscogsError extends Error {
  /**
   * @param {string} kind - `token` (refused or missing), `forbidden` (not
   * the owner), `notFound`, `quota`, `unreachable` or `invalid`.
   * @param {string} message - The detail.
   * @param {object} [extra] - `{ status }`.
   */
  constructor(kind, message, { status = null } = {}) {
    super(message);
    this.name = 'DiscogsError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description Wait.
 * @param {number} ms - Milliseconds.
 * @returns {Promise<void>}
 */
const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref?.());

/**
 * @description The client.
 * @param {object} [options] - `{ fetch, baseUrl, token, now, sleep }`.
 * @returns {object} The client.
 */
function createDiscogsClient({
  fetch: fetchFn = globalThis.fetch,
  baseUrl = BASE_URL,
  token = '',
  now = () => Date.now(),
  sleep = realSleep,
} = {}) {
  // One request at a time: a chain of promises.
  let queue = Promise.resolve();
  let lastSentAt = 0;

  const client = {
    token,
    // Requests made since the start, for the diagnostic.
    requests: 0,
    // The last rate limit headers: `{ limit, remaining, used }`.
    quota: null,
    // After a 429: no request before this time.
    blockedUntil: 0,

    /**
     * @description Send a request to the API, after the ones already queued.
     * @param {string} method - GET, POST, PUT or DELETE.
     * @param {string} path - "/oauth/identity".
     * @returns {Promise<object|null>} The JSON answer, null for 204.
     */
    request(method, path) {
      const run = queue.then(() => send(method, path));
      queue = run.catch(() => {});
      return run;
    },

    /** @returns {Promise<object>} `{ id, username }` of the token. */
    identity: async () => client.request('GET', '/oauth/identity'),

    /**
     * @param {string} username - The account.
     * @returns {Promise<object>} The profile.
     */
    profile: async (username) => client.request('GET', `/users/${user(username)}`),

    /**
     * @param {string} username - The account.
     * @returns {Promise<object[]>} The folders, "All" (id 0) included.
     */
    async folders(username) {
      const body = await client.request('GET', `/users/${user(username)}/collection/folders`);
      if (!Array.isArray(body?.folders)) {
        throw new DiscogsError('invalid', 'No folder list in the answer');
      }
      return body.folders;
    },

    /**
     * @param {string} username - The account.
     * @returns {Promise<object>} `{ minimum, median, maximum }`, formatted strings.
     */
    value: async (username) => client.request('GET', `/users/${user(username)}/collection/value`),

    /**
     * @description A page of a folder, the last added first.
     * @param {string} username - The account.
     * @param {object} [options] - `{ folder (0 = all), page, perPage }`.
     * @returns {Promise<object>} `{ pagination, releases }`.
     */
    async collection(username, { folder = 0, page = 1, perPage = 25 } = {}) {
      const body = await client.request(
        'GET',
        `/users/${user(username)}/collection/folders/${int(folder)}/releases?sort=added&sort_order=desc&page=${int(page)}&per_page=${int(perPage)}`,
      );
      if (!Array.isArray(body?.releases)) {
        throw new DiscogsError('invalid', 'No release list in the answer');
      }
      return body;
    },

    /**
     * @description The copies of a release in the collection.
     * @param {string} username - The account.
     * @param {number} releaseId - The release.
     * @returns {Promise<object[]>} The copies (empty when not owned).
     */
    async copies(username, releaseId) {
      try {
        const body = await client.request(
          'GET',
          `/users/${user(username)}/collection/releases/${int(releaseId)}`,
        );
        return Array.isArray(body?.releases) ? body.releases : [];
      } catch (err) {
        if (err.kind === 'notFound') {
          return [];
        }
        throw err;
      }
    },

    /**
     * @param {string} username - The account.
     * @param {number} folder - The folder (1 = Uncategorized).
     * @param {number} releaseId - The release.
     * @returns {Promise<object>} `{ instance_id }`.
     */
    addToCollection: async (username, folder, releaseId) =>
      client.request(
        'POST',
        `/users/${user(username)}/collection/folders/${int(folder)}/releases/${int(releaseId)}`,
      ),

    /**
     * @description A page of the wantlist, the last added first.
     * @param {string} username - The account.
     * @param {object} [options] - `{ page, perPage }`.
     * @returns {Promise<object>} `{ pagination, wants }`.
     */
    async wants(username, { page = 1, perPage = 25 } = {}) {
      const body = await client.request(
        'GET',
        `/users/${user(username)}/wants?sort=added&sort_order=desc&page=${int(page)}&per_page=${int(perPage)}`,
      );
      if (!Array.isArray(body?.wants)) {
        throw new DiscogsError('invalid', 'No wantlist in the answer');
      }
      return body;
    },

    /**
     * @param {string} username - The account.
     * @param {number} releaseId - The release.
     * @returns {Promise<object>} The want.
     */
    addWant: async (username, releaseId) =>
      client.request('PUT', `/users/${user(username)}/wants/${int(releaseId)}`),

    /**
     * @param {string} username - The account.
     * @param {number} releaseId - The release.
     * @returns {Promise<boolean>} False when it was not in the wantlist.
     */
    async removeWant(username, releaseId) {
      try {
        await client.request('DELETE', `/users/${user(username)}/wants/${int(releaseId)}`);
        return true;
      } catch (err) {
        if (err.kind === 'notFound') {
          return false;
        }
        throw err;
      }
    },

    /**
     * @description The releases a barcode is printed on (the API also returns
     * loose matches: see releases.js matchesBarcode).
     * @param {string} barcode - Digits.
     * @returns {Promise<object[]>} The raw results.
     */
    async searchBarcode(barcode) {
      const body = await client.request(
        'GET',
        `/database/search?barcode=${encodeURIComponent(barcode)}&type=release&per_page=50`,
      );
      return Array.isArray(body?.results) ? body.results : [];
    },

    /**
     * @param {number} releaseId - The release.
     * @param {string} [currency] - "EUR"; the account's when empty.
     * @returns {Promise<object>} `{ num_for_sale, lowest_price: { value, currency } }`.
     */
    marketStats: async (releaseId, currency) =>
      client.request(
        'GET',
        `/marketplace/stats/${int(releaseId)}${/^[A-Z]{3}$/.test(currency ?? '') ? `?curr_abbr=${currency}` : ''}`,
      ),

    /**
     * @param {number} releaseId - The release.
     * @returns {Promise<object>} The release.
     */
    release: async (releaseId) => client.request('GET', `/releases/${int(releaseId)}`),

    /**
     * @description The bytes of a cover, from the image host of Discogs only.
     * @param {string} url - The https URL of the image.
     * @returns {Promise<Buffer>} The bytes.
     */
    async image(url) {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        throw new DiscogsError('invalid', 'Invalid image URL');
      }
      if (parsed.protocol !== 'https:' || parsed.hostname !== IMAGE_HOST) {
        throw new DiscogsError('invalid', `Image outside ${IMAGE_HOST}`);
      }
      let response;
      try {
        response = await fetchFn(parsed.href, {
          headers: { 'user-agent': USER_AGENT },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        throw new DiscogsError('unreachable', err.cause?.message ?? err.message);
      }
      if (!response.ok) {
        throw new DiscogsError('unreachable', `Image: HTTP ${response.status}`, {
          status: response.status,
        });
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_IMAGE_BYTES) {
        throw new DiscogsError('invalid', `Image too large: ${bytes.length} bytes`);
      }
      return bytes;
    },
  };

  /**
   * @description An account name, checked before it goes into a path.
   * @param {string} username - The account.
   * @returns {string} The encoded name.
   */
  function user(username) {
    if (!USERNAME.test(String(username ?? ''))) {
      throw new DiscogsError('invalid', 'Invalid account name');
    }
    return encodeURIComponent(username);
  }

  /**
   * @description A positive integer, checked before it goes into a path.
   * @param {unknown} value - The value.
   * @returns {number} The integer.
   */
  function int(value) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) {
      throw new DiscogsError('invalid', `Invalid number: ${String(value).slice(0, 20)}`);
    }
    return number;
  }

  /**
   * @description Wait for the gap between two requests and for the window.
   * @returns {Promise<void>}
   */
  async function pace() {
    if (now() < client.blockedUntil) {
      throw new DiscogsError('quota', 'Rate limit of the Discogs API reached', { status: 429 });
    }
    let wait = lastSentAt + REQUEST_GAP_MS - now();
    if (client.quota && client.quota.remaining <= 0) {
      wait = Math.max(wait, lastSentAt + WINDOW_MS - now());
    }
    if (wait > 0) {
      await sleep(wait);
    }
  }

  /**
   * @description Send one request.
   * @param {string} method - The method.
   * @param {string} path - The path.
   * @returns {Promise<object|null>} The JSON answer.
   */
  async function send(method, path) {
    if (!client.token) {
      throw new DiscogsError('token', 'No personal access token');
    }
    await pace();
    lastSentAt = now();
    client.requests += 1;
    let response;
    try {
      response = await fetchFn(`${baseUrl}${path}`, {
        method,
        headers: {
          accept: 'application/vnd.discogs.v2.discogs+json',
          authorization: `Discogs token=${client.token}`,
          'user-agent': USER_AGENT,
          ...(method === 'POST' || method === 'PUT' ? { 'content-type': 'application/json' } : {}),
        },
        ...(method === 'POST' || method === 'PUT' ? { body: '{}' } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new DiscogsError('unreachable', err.cause?.message ?? err.message);
    }
    readQuota(response.headers);
    if (response.status === 204) {
      return null;
    }
    // An error page may not be JSON: its status still tells what happened.
    const body = await response.json().catch(() => null);
    const detail = typeof body?.message === 'string' ? body.message.slice(0, 160) : '';
    if (response.status === 429) {
      client.blockedUntil = now() + WINDOW_MS;
      throw new DiscogsError('quota', 'Rate limit of the Discogs API reached', { status: 429 });
    }
    if (response.status === 401) {
      throw new DiscogsError('token', detail || 'Token refused', { status: 401 });
    }
    if (response.status === 403) {
      throw new DiscogsError('forbidden', detail || 'Forbidden', { status: 403 });
    }
    if (response.status === 404) {
      throw new DiscogsError('notFound', detail || 'Not found', { status: 404 });
    }
    if (!response.ok) {
      throw new DiscogsError(
        response.status === 422 ? 'invalid' : 'unreachable',
        `HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
        { status: response.status },
      );
    }
    if (body === null) {
      throw new DiscogsError('invalid', 'Unreadable answer', { status: response.status });
    }
    return body;
  }

  /**
   * @description Remember the rate limit headers of an answer.
   * @param {Headers} headers - The headers.
   */
  function readQuota(headers) {
    const header = (name) => {
      const value = headers?.get?.(name);
      return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
        ? Number(value)
        : null;
    };
    const limit = header('x-discogs-ratelimit');
    const remaining = header('x-discogs-ratelimit-remaining');
    if (limit !== null && remaining !== null) {
      client.quota = { limit, remaining, used: header('x-discogs-ratelimit-used') };
    }
  }

  return client;
}

export {
  BASE_URL,
  USER_AGENT,
  IMAGE_HOST,
  MAX_IMAGE_BYTES,
  REQUEST_GAP_MS,
  WINDOW_MS,
  DiscogsError,
  createDiscogsClient,
};
