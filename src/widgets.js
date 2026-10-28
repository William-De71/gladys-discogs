// -----------------------------------------------------------------------------
// Dashboard widgets of the Discogs integration.
//
//   - `collection`   the account at a glance: records, wantlist, value of the
//                    collection (minimum, median, maximum), records for sale;
//   - `recent`       the last records added to the collection or to the
//                    wantlist, with their covers, as posters or as a list;
//   - `random`       a record of the collection (or of one folder) drawn at
//                    random, its large cover, a button to draw another one
//                    and a link to its page — "what do I play tonight?".
// Every content credits Discogs ("Data provided by Discogs", as the terms of
// the API ask). Covers are image keys (images.js), served by onWidgetGetImage.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t } from './i18n.js';
import { imageKeyOf, SIZES } from './images.js';

const WIDGETS = { COLLECTION: 'collection', RECENT: 'recent', RANDOM: 'random' };
const WIDGET_ACTIONS = { DRAW: 'draw' };
const TTL_SECONDS = { content: 600, message: 300, random: 3600 };
const RECENT_COUNT = { min: 1, max: 12, default: 6 };
const LISTS = ['collection', 'wantlist'];
const DISPLAYS = ['grid', 'list'];
const MAX_LIST_ITEMS = 8;

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description Read a bounded integer setting.
 * @param {unknown} raw - The raw setting.
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 */
function readCount(raw, bounds) {
  const value = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * @description Read a setting among allowed values.
 * @param {unknown} raw - The setting.
 * @param {string[]} allowed - The values, the default first.
 * @returns {string} The value.
 */
const readOption = (raw, allowed) => (allowed.includes(raw) ? raw : allowed[0]);

/**
 * @description A time of day: "22:51".
 * @param {number} at - Epoch milliseconds.
 * @param {string} [timeZone] - The time zone.
 * @returns {string} The time.
 */
function formatTime(at, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(at));
}

/**
 * @description A date: "27/10/2026", in the order of the language.
 * @param {number} at - Epoch milliseconds.
 * @param {string} language - The language.
 * @param {string} [timeZone] - The time zone.
 * @returns {string} The date.
 */
function formatDate(at, language, timeZone) {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : language, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(at));
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL_SECONDS.message) {
  return { ttl_seconds: ttl, components: [{ type: 'text', variant: 'body', text: message }] };
}

/**
 * @description The credit line: "Data provided by Discogs · 22:51".
 * @param {number} readAt - When the account was read.
 * @param {object} options - `{ language, timeZone }`.
 * @returns {object} The caption component.
 */
const credit = (readAt, { language, timeZone }) => ({
  type: 'text',
  variant: 'caption',
  text: t('credit', language, { time: formatTime(readAt, timeZone) }),
});

/**
 * @description "The Clash · 1999 · CD".
 * @param {object} release - A parsed release.
 * @returns {string} The text.
 */
const byline = (release) =>
  [release.artist, release.year, release.format].filter(Boolean).join(' · ');

/**
 * @description An amount as a tile value: rounded beyond 100, never more
 * than 12 characters.
 * @param {number} amount - The amount.
 * @returns {number} The value.
 */
const tileAmount = (amount) =>
  amount >= 100 ? Math.round(amount) : Math.round(amount * 100) / 100;

/**
 * @description The "collection" widget.
 * @param {object} options - `{ snapshot, language, timeZone }`, the snapshot
 * the last reading of the account.
 * @returns {object} The content.
 */
function buildCollectionWidget({ snapshot, language, timeZone }) {
  const { account, profile, value } = snapshot;
  const unit = clip(account.currency || '', 6);
  const tile = (label, number, icon, extra = {}) => ({
    type: 'value',
    label: t(label, language),
    value: number,
    icon,
    ...extra,
  });
  const components = [
    { type: 'text', variant: 'heading', text: clip(account.username, 40) },
    tile('tileRecords', profile.collection ?? 0, 'disc', { color: WIDGET_COLORS.PRIMARY }),
    tile('tileWantlist', profile.wantlist ?? 0, 'heart'),
  ];
  if (value) {
    const money = (label, amount, icon) =>
      tile(label, tileAmount(amount), icon, unit ? { unit } : {});
    components.push(
      money('tileValueMedian', value.median, 'trending-up'),
      money('tileValueMin', value.min, 'arrow-down'),
      money('tileValueMax', value.max, 'arrow-up'),
    );
  }
  components.push(tile('tileForSale', profile.forSale ?? 0, 'tag'));
  components.push(credit(snapshot.readAt, { language, timeZone }));
  return { ttl_seconds: TTL_SECONDS.content, components };
}

/**
 * @description The "recent" widget.
 * @param {object} options - `{ releases, list, display, readAt, language,
 * timeZone }`, `releases` the last added first.
 * @returns {object} The content.
 */
function buildRecentWidget({ releases, list, display, readAt, language, timeZone }) {
  if (releases.length === 0) {
    return messageContent(t(list === 'wantlist' ? 'widgetNoWant' : 'widgetNoRecord', language));
  }
  const max = display === 'list' ? MAX_LIST_ITEMS : 12;
  return {
    ttl_seconds: TTL_SECONDS.content,
    components: [
      {
        type: 'text',
        variant: 'heading',
        text: t(list === 'wantlist' ? 'recentWantsHeading' : 'recentHeading', language),
      },
      {
        type: 'card-list',
        display,
        items: releases.slice(0, max).map((release) => {
          const details = [
            release.formats,
            [release.label, release.catno].filter(Boolean).join(' – '),
            release.genre,
            release.addedAt
              ? t('addedOn', language, { date: formatDate(release.addedAt, language, timeZone) })
              : '',
          ].filter(Boolean);
          return {
            title: clip(release.title, 60),
            // The format is the badge.
            subtitle: clip([release.artist, release.year].filter(Boolean).join(' · '), 60),
            ...(release.thumb ? { image: imageKeyOf(release.releaseId, SIZES.small) } : {}),
            ...(release.format ? { badge: { text: clip(release.format, 16) } } : {}),
            description: clip(details.join('\n'), 2000),
            links: [{ url: release.url, label: t('openOnDiscogs', language) }],
          };
        }),
      },
      credit(readAt, { language, timeZone }),
    ],
  };
}

/**
 * @description The "random" widget.
 * @param {object} options - `{ release, folder, folderName, language }`,
 * `release` null when the folder is empty.
 * @returns {object} The content.
 */
function buildRandomWidget({ release, folder, folderName, language }) {
  const draw = {
    type: 'button',
    label: t(release ? 'buttonAnother' : 'buttonDraw', language),
    icon: 'shuffle',
    style: 'primary',
    action: { key: WIDGET_ACTIONS.DRAW, params: { folder } },
  };
  if (!release) {
    return {
      ttl_seconds: TTL_SECONDS.message,
      components: [
        {
          type: 'text',
          variant: 'body',
          text: t('widgetEmptyFolder', language, { folder: folderName }),
        },
        draw,
      ],
    };
  }
  return {
    ttl_seconds: TTL_SECONDS.random,
    components: [
      { type: 'text', variant: 'heading', text: clip(release.title, 40) },
      {
        type: 'text',
        variant: 'caption',
        text: clip(`${byline(release)} · ${t('discogs', language)}`, 80),
      },
      ...(release.cover || release.thumb
        ? [
            {
              type: 'image',
              key: imageKeyOf(release.releaseId, release.cover ? SIZES.large : SIZES.small),
              alt: clip(
                t('coverAlt', language, { release: `${release.artist} – ${release.title}` }),
                100,
              ),
              fit: 'contain',
            },
          ]
        : []),
      draw,
      {
        type: 'button',
        label: t('openOnDiscogs', language),
        icon: 'external-link',
        style: 'secondary',
        link: { url: release.url },
      },
    ],
  };
}

export {
  WIDGETS,
  WIDGET_ACTIONS,
  TTL_SECONDS,
  RECENT_COUNT,
  LISTS,
  DISPLAYS,
  clip,
  readCount,
  readOption,
  formatTime,
  formatDate,
  messageContent,
  byline,
  tileAmount,
  buildCollectionWidget,
  buildRecentWidget,
  buildRandomWidget,
};
