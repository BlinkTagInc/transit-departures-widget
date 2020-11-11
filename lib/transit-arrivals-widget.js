const path = require('path');

const { clone, omit } = require('lodash');
const fs = require('fs-extra');
const gtfs = require('gtfs');
const sanitize = require('sanitize-filename');
const Timer = require('timer-machine');

const fileUtils = require('./file-utils');
const logUtils = require('./log-utils');
const utils = require('./utils');

/*
 * Generate transit arrivals widget HTML from GTFS.
 */
module.exports = async initialConfig => {
  const config = utils.setDefaultConfig(initialConfig);
  config.log = logUtils.log(config);
  config.logWarning = logUtils.logWarning(config);

  await gtfs.openDb(config);

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
        url: config.agency.gtfs_static_url
      }
    ];

    await gtfs.import(gtfsImportConfig);
  }

  await fileUtils.prepDirectory(exportPath);

  config.log(`${agencyKey}: Generating Transit Arrivals Widget HTML`);

  config.assetPath = '';

  const html = await utils.generateTransitArrivalsWidgetHtml(config);
  await fs.writeFile(path.join(exportPath, 'index.html'), html);

  timer.stop();

  // Print stats
  config.log(`${agencyKey}: Transit Arrivals Widget HTML created at ${exportPath}`);

  const seconds = Math.round(timer.time() / 1000);
  config.log(`${agencyKey}: HTML generation required ${seconds} seconds`);
};
