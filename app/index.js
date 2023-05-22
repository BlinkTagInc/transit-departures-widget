import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import yargs from 'yargs';
import { openDb } from 'gtfs';

import express from 'express';
import logger from 'morgan';

import {
  setDefaultConfig,
  generateTransitArrivalsWidgetHtml,
} from '../lib/utils.js';

const { argv } = yargs(process.argv).option('c', {
  alias: 'configPath',
  describe: 'Path to config file',
  default: './config.json',
  type: 'string',
});

const app = express();
const router = new express.Router();

const configPath =
  argv.configPath || new URL('../config.json', import.meta.url);
const selectedConfig = JSON.parse(readFileSync(configPath));

const config = setDefaultConfig(selectedConfig);
// Override noHead config option so full HTML pages are generated
config.noHead = false;
config.assetPath = '/';
config.log = console.log;
config.logWarning = console.warn;
config.logError = console.error;

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

/*
 * Show the transit arrivals widget
 */
router.get('/', async (request, response, next) => {
  try {
    const html = await generateTransitArrivalsWidgetHtml(config);
    response.send(html);
  } catch (error) {
    next(error);
  }
});

app.set('views', path.join(fileURLToPath(import.meta.url), '../../views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(
  express.static(path.join(fileURLToPath(import.meta.url), '../../public'))
);

app.use('/', router);
app.set('port', process.env.PORT || 3000);

const server = app.listen(app.get('port'), () => {
  console.log(`Express server listening on port ${server.address().port}`);
});
