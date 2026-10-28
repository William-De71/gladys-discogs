# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for a Discogs record collection: a
Node.js service (Node 22+, ESM, no build step) that runs in its own sandboxed
Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads the official Discogs API
(`https://api.discogs.com`, documentation https://www.discogs.com/developers)
with the user's personal access token (`Authorization: Discogs token=…`, 60
requests per minute): at each reading the profile (counts, currency), the
folders, the value of the collection and the first page of the collection and
of the wantlist, the last added first (`sort=added&sort_order=desc`, needed:
the default order of the wantlist is not by date). Covers come from
`i.discogs.com`, only when a widget shows them. Transport: cloud only.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/widgets.test.js          # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); the timer, the reading, the scene actions
src/discogs-api.js      HTTP client: token, User-Agent, one request at a time, rate limit, 429, covers
src/releases.js         raw releases / search results -> kept fields, money, barcodes, typed release ids
src/device.js           the account and folder devices and their states
src/events.js           additions between two readings, event data, scene action outputs
src/widgets.js          collection, recent and random dashboard widgets
src/images.js           widget image keys of the covers (dg-<release>-s|l)
src/store.js            /data/discogs.json: `seen`, `covers`, `picks`
src/config.js           configuration (token, interval, currency, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
test/fixtures/          real answers of the Discogs API, reduced; owner-only ones shaped after the docs
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (`account:<account id>`, `folder:<account id>_<folder
id>` — the numeric ids of Discogs, never the user name, which can change),
  feature `category` / `type` / `unit` / `min` / `max` / `step`, the keys of
  `config_schema`, `actions`, the widgets and their settings, scene triggers
  (fields, options, variables) and scene actions (fields, options, outputs),
  the widget image keys and the internal config key `last_language`.
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Category / type pairs.** Counts are `counter-sensor` / `integer`; the
  value is `currency` / `decimal` with the unit of the account currency (euro,
  dollar, pound sterling, none for the others); the last record is `text`.
  Never publish a fake 0: a value Discogs does not give is left out.
- **`should_poll` stays false**: the integration reads the account on its own
  timer (`interval`, 15 min to 3 h, 30 min by default). A widget or a scene
  action reuses a reading of less than 5 min.
- **Rate limit.** 60 requests per minute per token, moving window. The client
  sends one request at a time, at least 1.1 s apart, waits for the window when
  none is left and sends nothing for a minute after a 429. Five requests per
  reading: never add a request per record or per folder to a reading.
- **The token is a secret.** Never log it (the diagnostic shows its last four
  characters), never put it in an error message, a URL or a widget.
- **Events once.** `seen` (in /data) keeps, per account id, the first page of
  the collection (instance ids) and of the wantlist (release ids) at the last
  reading, with the date of its oldest entry. The first reading is a baseline;
  an entry moving up into a full page after a removal is no addition; 10
  events at most per reading. A scene action that adds a record marks it seen
  first: it never fires a trigger. A widget never fires an event.
- **Barcodes.** The search of Discogs answers loose matches (millions) for an
  unknown barcode: keep only the results whose `barcode` has the same digits.
- **Covers.** Only `https://i.discogs.com/` is ever fetched, under 300 KB; the
  image key carries the release, so a restart needs no state to serve it.
  The illustrations draw their covers, never the real artwork.
- **Credit.** The terms of the Discogs API ask for "Data provided by Discogs":
  keep it in every widget, and the credit in the README, the docs and NOTICE.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it. Titles, artists, labels and folders stay
  as Discogs writes them.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. `gladys_version` is `>=5.3.0` (widgets, scene triggers, button forms,
  catalog `keywords`). Transport: `["cloud"]`. No permission. One secret
  (`token`), no `countries` (worldwide).
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (the fake API of
  `test/helpers/fixtures.js`).
