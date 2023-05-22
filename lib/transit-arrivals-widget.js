import path from 'path';
import { clone, omit } from 'lodash-es';
import { writeFile } from 'node:fs/promises';
import { importGtfs, openDb } from 'gtfs';
import sanitize from 'sanitize-filename';
import Timer from 'timer-machine';

import { copyStaticAssets, prepDirectory } from './file-utils.js';
import { log, logWarning } from './log-utils.js';
import {
  generateTransitArrivalsWidgetHtml,
  setDefaultConfig,
} from './utils.js';

/*
 * Generate transit arrivals widget HTML from GTFS.
 */
async function transitArrivalsWidget(initialConfig) {
  const config = setDefaultConfig(initialConfig);
  config.log = log(config);
  config.logWarning = logWarning(config);

  try {
    openDb(config);
  } catch (error) {
    if (error instanceof Error && error.code === 'SQLITE_CANTOPEN') {
      config.logError(
        `Unable to open sqlite database "${config.sqlitePath}" defined as \`sqlitePath\` config.json. Ensure the parent directory exists or remove \`sqlitePath\` from config.json.`
      );
    }

    throw error;
  }

  if (!config.agency) {
    throw new Error('No agency defined in `config.json`');
  }

  const timer = new Timer();
  const agencyKey = config.agency.agency_key;
  const exportPath = path.join(process.cwd(), 'html', sanitize(agencyKey));

  timer.start();

  if (!config.skipImport) {
    // Import GTFS
    const gtfsImportConfig = clone(omit(config, 'agency'));
    gtfsImportConfig.agencies = [
      {
        agency_key: config.agency.agency_key,
        path: config.agency.gtfs_static_path,
        url: config.agency.gtfs_static_url,
      },
    ];

    await importGtfs(gtfsImportConfig);
  }

  await prepDirectory(exportPath);

  if (config.noHead !== true) {
    copyStaticAssets(exportPath);
  }

  config.log(`${agencyKey}: Generating Transit Arrivals Widget HTML`);

  config.assetPath = '';

  const html = await generateTransitArrivalsWidgetHtml(config);
  await writeFile(path.join(exportPath, 'index.html'), html);

  timer.stop();

  // Print stats
  config.log(
    `${agencyKey}: Transit Arrivals Widget HTML created at ${exportPath}`
  );

  const seconds = Math.round(timer.time() / 1000);
  config.log(`${agencyKey}: HTML generation required ${seconds} seconds`);
}

export default transitArrivalsWidget;
