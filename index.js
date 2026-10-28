// -----------------------------------------------------------------------------
// Entry point of the Discogs external integration.
//
// Brings a Discogs record collection (https://www.discogs.com) into Gladys,
// through the official API and the user's personal access token:
//   - devices: the account (records in the collection, in the wantlist, for
//     sale, value of the collection, last record added) and one per folder
//     (src/device.js);
//   - scene triggers: a record added to the collection, to the wantlist;
//   - scene actions: a random record, search a barcode, add to the
//     collection, add to / remove from the wantlist, price of a record, the
//     collection in a sentence;
//   - dashboard widgets: collection, recent additions, random record.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Discogs integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
