// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The three widgets on a Tuesday morning: the last copies of a public
// collection and the account of the tests (test/fixtures, data provided by
// Discogs) go through the real parser (src/releases.js) and the real widget
// builders (src/widgets.js). The covers are drawn, never the real artwork.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildCollectionWidget, buildRecentWidget, buildRandomWidget } =
  await load('src/widgets.js');
const { parseRelease } = await load('src/releases.js');
const { imageKeyOf } = await load('src/images.js');
const { LANGUAGES } = await load('src/i18n.js');
const fixture = (name) => JSON.parse(readFileSync(`${repo}/test/fixtures/${name}`, 'utf8'));
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Wednesday 28 October 2026, 11:00 in Paris.
const NOW = Date.parse('2026-10-28T10:00:00Z');
const TZ = 'Europe/Paris';

const releases = fixture('collection.json').releases.map(parseRelease);
const snapshot = {
  account: { id: 1234567, username: 'gladys_tester', currency: 'EUR' },
  profile: { collection: 1234, wantlist: 56, forSale: 2 },
  value: { min: 3011.15, median: 6128.8, max: 9845.5 },
  readAt: NOW,
};

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    collection: buildCollectionWidget({ snapshot, language, timeZone: TZ }),
    recent: buildRecentWidget({
      releases,
      list: 'collection',
      display: 'list',
      readAt: NOW,
      language,
      timeZone: TZ,
    }),
    random: buildRandomWidget({
      release: releases[3],
      folder: 3,
      folderName: 'Vinyles',
      language,
    }),
  };
}

// Drawn covers: a color and a pattern per record, never the real artwork.
const HUES = [8, 212, 42, 160, 280, 120];
const PATTERNS = [
  (h) =>
    `<circle cx="150" cy="150" r="90" fill="none" stroke="hsl(${h},70%,85%)" stroke-width="14"/>`,
  (h) => `<path d="M0 220 L150 60 L300 220 Z" fill="hsl(${h},60%,80%)"/>`,
  (h) =>
    `<rect x="60" y="60" width="180" height="180" fill="none" stroke="hsl(${h},70%,88%)" stroke-width="12"/><rect x="110" y="110" width="80" height="80" fill="hsl(${h},70%,88%)"/>`,
  (h) =>
    `<path d="M0 150 Q 75 60 150 150 T 300 150" fill="none" stroke="hsl(${h},70%,88%)" stroke-width="16"/>`,
  (h) =>
    `<circle cx="100" cy="110" r="50" fill="hsl(${h},60%,82%)"/><circle cx="200" cy="190" r="50" fill="hsl(${h},60%,70%)"/>`,
  (h) =>
    `<path d="M40 260 L260 40 M40 200 L200 40 M100 260 L260 100" stroke="hsl(${h},70%,88%)" stroke-width="12"/>`,
];
const images = {};
releases.forEach((release, i) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="hsl(${HUES[i]},45%,38%)"/>${PATTERNS[i](HUES[i])}</svg>`;
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  images[imageKeyOf(release.releaseId, 's')] = uri;
  images[imageKeyOf(release.releaseId, 'l')] = uri;
});

const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents, images }));
