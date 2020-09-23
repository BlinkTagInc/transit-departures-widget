const gtfs = require('gtfs');
const express = require('express');

const utils = require('../lib/utils');
const config = require('../config');

// Override noHead config option so full HTML pages are generated
config.noHead = false;
config.assetPath = '/';
config.log = console.log;
config.logWarning = console.warn;
config.logError = console.error;

const router = new express.Router();

gtfs.openDb(config);

/*
 * Show all timetable pages
 */
router.get('/', async (request, response, next) => {
  try {
    const html = await utils.generateTransitPredictionsHtml(config);
    response.send(html);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
