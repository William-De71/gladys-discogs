# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - 2026-10-28

### Added

- A Discogs account in Gladys through the official Discogs API and a personal access token: one device for the account (records in the collection, in the wantlist, for sale, minimum / median / maximum value of the collection, last record added) and one per folder of the collection with its count.
- Scene triggers: a record added to the collection (filtered by folder and by format) and a record added to the wantlist (filtered by format), with title, artist, year, format, label, catalog number, genre, cover and page.
- Scene actions: a random record of the collection or of a folder, search a barcode (only the releases really printed with it), add a release to the collection (no second copy unless asked), add it to / remove it from the wantlist, the copies for sale and the lowest price on the marketplace, the collection in a sentence.
- Dashboard widgets: the collection at a glance, the last records added to the collection or to the wantlist with their covers (posters or list), and a random record with its large cover and a button to draw another one.
- Configuration actions: test the connection, and a diagnostic written to the Logs tab (the token hidden).
- Cloud transport: five requests per reading (every 15 minutes to 3 hours, 30 minutes by default), one at a time, within the 60 requests per minute of the API; covers read from the image host of Discogs only.
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.

[0.1.0]: https://github.com/William-De71/gladys-discogs/releases/tag/v0.1.0
