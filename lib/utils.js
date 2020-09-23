const gtfs = require('gtfs');
const { sortBy } = require('lodash');
const fileUtils = require('./file-utils');

/*
 * Format a route name.
 */
function formatRouteName(route) {
  let routeName = '';

  if (route.route_short_name !== null) {
    routeName += route.route_short_name;
  }

  if (route.route_short_name !== null && route.route_long_name !== null) {
    routeName += ' - ';
  }

  if (route.route_long_name !== null) {
    routeName += route.route_long_name;
  }

  return routeName;
}

/*
 * Generate HTML for transit predictions tool.
 */
exports.generateTransitPredictionsHtml = async (config) => {
  const db = gtfs.getDb();
  const routes = await gtfs.getRoutes();
  const filteredRoutes = [];

  await Promise.all(routes.map(async route => {
    route.route_full_name = formatRouteName(route);

    // Lookup direction names from non-standard directions.txt file
    let directions = await gtfs.getDirections({ route_id: route.route_id }, ['direction_id', 'direction']);

    if (directions.length === 0) {
      directions = await db.all('SELECT DISTINCT direction_id, trip_headsign as direction FROM trips WHERE route_id = ?', [route.route_id]);
    }

    // Filter out routes with no directions
    if (directions.length === 0) {
      config.logWarning(`Route ${route.route_id} has no directions`);
      return
    }

    await Promise.all(directions.map(async direction => {
      const stops = await db.all('SELECT DISTINCT stop_times.stop_id, stops.stop_name FROM stop_times INNER JOIN stops ON stops.stop_id = stop_times.stop_id WHERE trip_id IN (SELECT trip_id FROM trips WHERE route_id = ?) ORDER BY stop_sequence ASC', [route.route_id]);
      direction.stops = stops;
    }));

    route.directions = directions;
    filteredRoutes.push(route);
  }));

  // Sort twice to handle integers with alphabetical characters, such as ['14', '14L', '14X']
  const sortedRoutes = sortBy(sortBy(filteredRoutes, 'route_short_name'), route => parseInt(route.route_short_name, 10));

  const templateVars = {
    routes: sortedRoutes,
    config
  };
  return fileUtils.renderFile('tool', templateVars, config);
};
