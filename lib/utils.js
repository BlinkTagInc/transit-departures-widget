const gtfs = require('gtfs');
const { groupBy, maxBy, sortBy } = require('lodash');
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
 * Get directions for a route
 */
async function getDirectionsForRoute(route) {
  const db = gtfs.getDb();

  // Lookup direction names from non-standard directions.txt file
  const directions = await gtfs.getDirections({ route_id: route.route_id }, ['direction_id', 'direction']);

  // Else use the most common headsigns as directions from trips.txt file
  if (directions.length === 0) {
    const headsigns = await db.all('SELECT direction_id, trip_headsign, count(*) AS count FROM trips WHERE route_id = ? GROUP BY direction_id, trip_headsign', [route.route_id]);

    for (const group of Object.values(groupBy(headsigns, 'direction_id'))) {
      const mostCommonHeadsign = maxBy(group, 'count');
      directions.push({
        direction_id: mostCommonHeadsign.direction_id,
        direction: mostCommonHeadsign.trip_headsign
      });
    }
  }

  return directions;
}

/*
 * Generate HTML for transit arrivals widget.
 */
exports.generateTransitArrivalsWidgetHtml = async config => {
  const db = gtfs.getDb();
  const routes = await gtfs.getRoutes();
  const filteredRoutes = [];

  await Promise.all(routes.map(async route => {
    route.route_full_name = formatRouteName(route);

    const directions = await getDirectionsForRoute(route);

    // Filter out routes with no directions
    if (directions.length === 0) {
      config.logWarning(`Route ${route.route_id} has no directions`);
      return;
    }

    await Promise.all(directions.map(async direction => {
      const stops = await db.all('SELECT DISTINCT stop_times.stop_id, stops.stop_name FROM stop_times INNER JOIN stops ON stops.stop_id = stop_times.stop_id WHERE trip_id IN (SELECT trip_id FROM trips WHERE route_id = ?) ORDER BY stop_sequence ASC', [route.route_id]);
      direction.stops = stops;

      const trips = await gtfs.getTrips({ route_id: route.route_id, direction_id: direction.direction_id }, ['trip_id']);
      direction.trip_ids = trips.map(trip => trip.trip_id);
    }));

    route.directions = directions;
    filteredRoutes.push(route);
  }));

  // Sort twice to handle integers with alphabetical characters, such as ['14', '14L', '14X']
  const sortedRoutes = sortBy(sortBy(filteredRoutes, 'route_short_name'), route => Number.parseInt(route.route_short_name, 10));

  const templateVars = {
    routes: sortedRoutes,
    config
  };
  return fileUtils.renderFile('widget', templateVars, config);
};
