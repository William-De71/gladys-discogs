// -----------------------------------------------------------------------------
// Covers of the widgets.
//
// A widget refers to an image by a key (`^[a-z0-9][a-z0-9-]{0,63}$`); the core
// asks for its bytes through onWidgetGetImage and caches them one hour per
// key. The key carries the release id and the size ("dg-644773-s" for the
// 150 px thumbnail, "dg-644773-l" for the large cover, up to 600 px): the
// handler finds the address of the cover from the release alone — after a
// restart too — and only ever reads the image host of Discogs.
// -----------------------------------------------------------------------------

const KEY_REGEX = /^dg-(\d{1,12})-([sl])$/;
const SIZES = { small: 's', large: 'l' };

/**
 * @description The widget image key of a cover.
 * @param {number} releaseId - The release.
 * @param {string} [size] - `s` (thumbnail) or `l` (large).
 * @returns {string} The key.
 * @example
 * imageKeyOf(644773, 'l'); // -> 'dg-644773-l'
 */
const imageKeyOf = (releaseId, size = SIZES.small) => `dg-${releaseId}-${size}`;

/**
 * @description The release and size of a widget image key.
 * @param {string} key - The key.
 * @returns {{ releaseId: number, size: string }|null} Null for a key this
 * integration never produced.
 */
function parseImageKey(key) {
  const match = KEY_REGEX.exec(String(key ?? ''));
  if (!match) {
    return null;
  }
  const releaseId = Number(match[1]);
  return Number.isSafeInteger(releaseId) && releaseId > 0 ? { releaseId, size: match[2] } : null;
}

export { SIZES, imageKeyOf, parseImageKey };
