// -----------------------------------------------------------------------------
// Configuration of the Discogs integration.
//
// Fields of the config_schema:
//   - `token`      the personal access token of the Discogs account (secret):
//                  Settings → Developers → "Generate new token";
//   - `interval`   seconds between two readings of the account;
//   - `currency`   the currency of the marketplace prices (`auto`: the one of
//                  the account); the value of the collection always comes in
//                  the currency of the account;
//   - `language`   language of the texts Gladys does not ask for in a
//                  language (feature names, scene summaries): `auto` follows
//                  the last widget request.
//
// Internal key, outside the config_schema (stored by setConfig):
//   - `last_language`   language of the last widget request.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

// Five requests per reading: even every 15 min, far below the 60 per minute
// of the API.
const INTERVALS = [900, 1800, 3600, 10800];
const DEFAULT_INTERVAL = 1800;
// The currencies of the Discogs marketplace.
const CURRENCIES = [
  'USD',
  'GBP',
  'EUR',
  'CAD',
  'AUD',
  'JPY',
  'CHF',
  'MXN',
  'BRL',
  'NZD',
  'SEK',
  'ZAR',
];
const AUTO = 'auto';
const AUTO_LANGUAGE = AUTO;
const INTERNAL_KEYS = { language: 'last_language' };
// A personal access token of Discogs: 40 letters and digits. Anything printable
// is accepted, the API says whether it is right.
const TOKEN = /^[\x21-\x7e]{10,200}$/;

const readString = (raw) => (typeof raw === 'string' ? raw.trim() : '');

/**
 * @description Read a value among allowed numbers.
 * @param {unknown} raw - The raw value ("1800", 1800).
 * @param {number[]} allowed - The allowed values.
 * @param {number} fallback - The default.
 * @returns {number} The value.
 */
function readChoice(raw, allowed, fallback) {
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  return allowed.includes(value) ? value : fallback;
}

/**
 * @description The token, without what a copy and paste adds around it.
 * @param {unknown} raw - The typed token.
 * @returns {string} The token, '' when it cannot be one.
 * @example
 * readToken(' Discogs token=abcdefghijklmnop '); // -> 'abcdefghijklmnop'
 */
function readToken(raw) {
  const value = readString(raw)
    .replace(/^discogs\s+token\s*=\s*/i, '')
    .replace(/^token\s*=\s*/i, '');
  return TOKEN.test(value) ? value : '';
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} `{ token, interval, currency, language }`.
 * @example
 * normalizeConfig({ token: 'abcdefghijklmnop', interval: '900' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const currency = readString(config.currency).toUpperCase();
  return {
    token: readToken(config.token),
    interval: readChoice(config.interval, INTERVALS, DEFAULT_INTERVAL),
    currency: CURRENCIES.includes(currency) ? currency : AUTO,
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  INTERVALS,
  DEFAULT_INTERVAL,
  CURRENCIES,
  AUTO,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  readToken,
  normalizeConfig,
  readLanguage,
};
