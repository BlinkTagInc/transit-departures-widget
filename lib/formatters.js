const moment = require('moment');

/*
 * Time to seconds
 */
exports.timeToSeconds = time => moment.duration(time).asSeconds();
