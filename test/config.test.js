import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConfig, readToken, readLanguage, DEFAULT_INTERVAL, AUTO } from '../src/config.js';

test('defaults: no token, every 30 minutes, the currency and language automatic', () => {
  assert.deepEqual(normalizeConfig(), {
    token: '',
    interval: DEFAULT_INTERVAL,
    currency: AUTO,
    language: AUTO,
  });
  assert.deepEqual(normalizeConfig(null), normalizeConfig({}));
});

test('the token: trimmed, what a copy and paste adds removed, nonsense refused', () => {
  const token = 'abcdefghijklmnopqrstuvwxyz0123456789ABCD';
  assert.equal(readToken(` ${token}\n`), token);
  assert.equal(readToken(`Discogs token=${token}`), token);
  assert.equal(readToken(`token=${token}`), token);
  assert.equal(readToken('short'), '');
  assert.equal(readToken('with a space inside it'), '');
  assert.equal(readToken(42), '');
});

test('interval, currency and language among the allowed values', () => {
  const config = normalizeConfig({ interval: '900', currency: 'eur', language: 'de' });
  assert.equal(config.interval, 900);
  assert.equal(config.currency, 'EUR');
  assert.equal(config.language, 'de');
  const wrong = normalizeConfig({ interval: '60', currency: 'BTC', language: 'it' });
  assert.equal(wrong.interval, DEFAULT_INTERVAL);
  assert.equal(wrong.currency, AUTO);
  assert.equal(wrong.language, AUTO);
});

test('the stored language of the last widget request', () => {
  assert.equal(readLanguage({ last_language: 'es' }, 'en'), 'es');
  assert.equal(readLanguage({ last_language: 'español' }, 'en'), 'en');
  assert.equal(readLanguage(undefined, 'fr'), 'fr');
});
