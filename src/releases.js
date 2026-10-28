// -----------------------------------------------------------------------------
// Raw answers of the Discogs API -> the fields the integration keeps.
//
// A release of the collection or of the wantlist carries its catalog data in
// `basic_information` (title, year, artists, formats, labels, covers, genres);
// a search result in flat fields ("Artist - Title", `format`, `label`,
// `barcode`). Discogs tells apart two artists of the same name with a number
// ("Butterflies (3)"): it is dropped from what the user reads.
//
// The value of a collection comes as formatted strings ("€1,234.56",
// "$500.00", "CA$12.00"), in the currency of the account: parseMoney reads
// the number back.
// -----------------------------------------------------------------------------

const RELEASE_URL = 'https://www.discogs.com/release/';
const MAX_TEXT = 200;

const text = (value, max = MAX_TEXT) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/**
 * @description An artist name without the number Discogs adds to tell
 * namesakes apart.
 * @param {string} name - "Butterflies (3)".
 * @returns {string} "Butterflies".
 */
const cleanArtist = (name) => text(name).replace(/\s\(\d+\)$/, '');

/**
 * @description The artists of a release, as Discogs credits them.
 * @param {object[]} [artists] - `[{ name, anv, join }]`.
 * @returns {string} "Simon & Garfunkel".
 * @example
 * artistsText([{ name: 'Simon', join: '&' }, { name: 'Garfunkel' }]); // -> 'Simon & Garfunkel'
 */
function artistsText(artists) {
  if (!Array.isArray(artists) || artists.length === 0) {
    return '';
  }
  return artists
    .map((artist, index) => {
      const name = cleanArtist(artist?.anv || artist?.name);
      const join = text(artist?.join, 10);
      if (index === artists.length - 1 || !join) {
        return index === artists.length - 1 ? name : `${name}, `;
      }
      return join === ',' ? `${name}, ` : `${name} ${join} `;
    })
    .join('')
    .slice(0, MAX_TEXT);
}

/**
 * @description The formats of a release, short: "Vinyl, 12", 45 RPM".
 * @param {object[]} [formats] - `[{ name, qty, descriptions, text }]`.
 * @returns {string} The text.
 */
function formatsText(formats) {
  if (!Array.isArray(formats) || formats.length === 0) {
    return '';
  }
  return formats
    .slice(0, 3)
    .map((format) => {
      const qty = Number(format?.qty) > 1 ? `${Number(format.qty)}× ` : '';
      const descriptions = Array.isArray(format?.descriptions)
        ? format.descriptions.slice(0, 3).map((d) => text(d, 30))
        : [];
      return [`${qty}${text(format?.name, 30)}`, ...descriptions].filter(Boolean).join(', ');
    })
    .join(' + ')
    .slice(0, MAX_TEXT);
}

/**
 * @description A year, or null when Discogs does not know it (0 or "").
 * @param {unknown} raw - 2006, "1999", 0.
 * @returns {number|null} The year.
 */
function readYear(raw) {
  const year = Number(raw);
  return Number.isInteger(year) && year > 1800 && year < 3000 ? year : null;
}

/**
 * @description An https URL of the image host, else ''.
 * @param {unknown} raw - The URL.
 * @returns {string} The URL.
 */
const imageUrl = (raw) =>
  typeof raw === 'string' && raw.startsWith('https://i.discogs.com/') && raw.length <= 2048
    ? raw
    : '';

/**
 * @description A release of the collection or of the wantlist.
 * @param {object} raw - `{ id, instance_id?, folder_id?, date_added, rating,
 * basic_information }`.
 * @returns {object|null} The kept fields, null when unusable.
 */
function parseRelease(raw) {
  const info = raw?.basic_information;
  const releaseId = Number(raw?.id ?? info?.id);
  if (!info || !Number.isSafeInteger(releaseId) || releaseId <= 0) {
    return null;
  }
  const label = Array.isArray(info.labels) ? info.labels[0] : null;
  const addedAt = Date.parse(raw.date_added ?? '');
  const instanceId = Number(raw.instance_id);
  return {
    releaseId,
    instanceId: Number.isSafeInteger(instanceId) && instanceId > 0 ? instanceId : null,
    folderId: Number.isSafeInteger(Number(raw.folder_id)) ? Number(raw.folder_id) : null,
    title: text(info.title) || `#${releaseId}`,
    artist: artistsText(info.artists),
    year: readYear(info.year),
    format: text(info.formats?.[0]?.name, 40),
    formats: formatsText(info.formats),
    label: label ? text(label.name, 100) : '',
    catno: label ? text(label.catno, 60) : '',
    genre: text(info.genres?.[0], 60),
    style: text(info.styles?.[0], 60),
    rating: Number.isInteger(raw.rating) ? raw.rating : 0,
    thumb: imageUrl(info.thumb),
    cover: imageUrl(info.cover_image),
    addedAt: Number.isFinite(addedAt) ? addedAt : null,
    url: `${RELEASE_URL}${releaseId}`,
  };
}

/**
 * @description A release read with GET /releases/<id>.
 * @param {object} raw - The release.
 * @returns {object|null} The kept fields (no instance, no date of addition).
 */
function parseFullRelease(raw) {
  if (!raw || !Number.isSafeInteger(Number(raw.id))) {
    return null;
  }
  const image = Array.isArray(raw.images) ? raw.images[0] : null;
  return parseRelease({
    id: raw.id,
    basic_information: {
      ...raw,
      thumb: raw.thumb || image?.uri150,
      cover_image: image?.uri,
    },
  });
}

/**
 * @description The digits of a barcode, without the leading zeros (a UPC-A
 * of 12 digits is the EAN-13 with a leading 0).
 * @param {unknown} raw - "5 099749 534728".
 * @returns {string} "5099749534728".
 */
const barcodeDigits = (raw) =>
  String(raw ?? '')
    .replace(/\D/g, '')
    .replace(/^0+/, '');

/**
 * @description Whether a search result is really printed with a barcode:
 * for an unknown barcode, the search of Discogs returns loose matches
 * (millions of them), never an empty list.
 * @param {object} result - The raw result, `barcode` an array of texts.
 * @param {string} barcode - The barcode looked for.
 * @returns {boolean} True when one of its barcodes has the same digits.
 */
function matchesBarcode(result, barcode) {
  const wanted = barcodeDigits(barcode);
  return (
    wanted.length >= 6 &&
    Array.isArray(result?.barcode) &&
    result.barcode.some((code) => barcodeDigits(code) === wanted)
  );
}

/**
 * @description A result of the database search.
 * @param {object} raw - `{ id, title: "Artist - Title", year, format[],
 * label[], country, catno, community }`.
 * @returns {object|null} The kept fields.
 */
function parseSearchResult(raw) {
  const releaseId = Number(raw?.id);
  if (!Number.isSafeInteger(releaseId) || releaseId <= 0) {
    return null;
  }
  const full = text(raw.title);
  const split = full.indexOf(' - ');
  return {
    releaseId,
    title: split > 0 ? full.slice(split + 3) : full,
    artist: split > 0 ? cleanArtist(full.slice(0, split)) : '',
    year: readYear(raw.year),
    format: text(raw.format?.[0], 40),
    formats: Array.isArray(raw.format)
      ? raw.format
          .slice(0, 4)
          .map((f) => text(f, 30))
          .join(', ')
      : '',
    label: text(raw.label?.[0], 100),
    catno: text(raw.catno, 60),
    country: text(raw.country, 60),
    have: Number(raw.community?.have) || 0,
    thumb: imageUrl(raw.thumb),
    url: `${RELEASE_URL}${releaseId}`,
  };
}

/**
 * @description The release a user typed: its number, "r12345", "[r12345]"
 * or the address of its page.
 * @param {unknown} raw - The input.
 * @returns {number|null} The release id.
 * @example
 * parseReleaseInput('https://www.discogs.com/release/644773-The-Clash-London-Calling'); // -> 644773
 */
function parseReleaseInput(raw) {
  const value = String(raw ?? '').trim();
  const match =
    /^\[?r?(\d{1,12})\]?$/i.exec(value) ??
    /discogs\.com\/(?:[a-z]{2}\/)?release\/(\d{1,12})/i.exec(value);
  if (!match) {
    return null;
  }
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * @description A formatted amount back to a number.
 * @param {unknown} raw - "€1,234.56", "$500.00", "1.234,56 €", "¥12,000".
 * @returns {number|null} 1234.56, null when there is no amount.
 */
function parseMoney(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const digits = String(raw ?? '').replace(/[^\d.,]/g, '');
  if (!/\d/.test(digits)) {
    return null;
  }
  const lastDot = digits.lastIndexOf('.');
  const lastComma = digits.lastIndexOf(',');
  const decimalAt = Math.max(lastDot, lastComma);
  // A separator followed by exactly one or two digits is the decimal one;
  // three digits make it a thousands separator ("¥12,000").
  const decimals = decimalAt >= 0 ? digits.length - decimalAt - 1 : 0;
  let normalized;
  if (decimalAt >= 0 && decimals > 0 && decimals <= 2) {
    normalized = `${digits.slice(0, decimalAt).replace(/[.,]/g, '')}.${digits.slice(decimalAt + 1)}`;
  } else {
    normalized = digits.replace(/[.,]/g, '');
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/**
 * @description "Artist – Title", or the title alone.
 * @param {object} release - A parsed release.
 * @returns {string} The text.
 */
const releaseText = (release) =>
  release.artist ? `${release.artist} – ${release.title}` : release.title;

export {
  RELEASE_URL,
  cleanArtist,
  artistsText,
  formatsText,
  readYear,
  parseRelease,
  parseFullRelease,
  barcodeDigits,
  matchesBarcode,
  parseSearchResult,
  parseReleaseInput,
  parseMoney,
  releaseText,
};
