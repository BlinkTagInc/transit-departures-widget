const gtfs = require('gtfs');
const { groupBy, maxBy, sortBy, uniqBy } = require('lodash');
const fileUtils = require('./file-utils');
const toposort = require('toposort');

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
 * Sort an array of stoptimes by stop_sequence using a directed graph
 */
function sortStopIdsBySequence(stoptimes) {
  const stoptimesGroupedByTrip = groupBy(stoptimes, 'trip_id');
  const stopGraph = [];

  for (const tripStoptimes of Object.values(stoptimesGroupedByTrip)) {
    const sortedStopIds = sortBy(tripStoptimes, 'stop_sequence').map(stoptime => stoptime.stop_id);

    for (const [index, stopId] of sortedStopIds.entries()) {
      if (index === sortedStopIds.length - 1) {
        continue;
      }

      stopGraph.push([stopId, sortedStopIds[index + 1]]);
    }
  }

  return toposort(stopGraph);
}

/*
 * Get stops in order for a route and direction
 */
async function getStopsForDirection(route, direction) {
  const db = gtfs.getDb();
  const stoptimes = await db.all('SELECT stop_id, stop_sequence, trip_id FROM stop_times WHERE trip_id IN (SELECT trip_id FROM trips WHERE route_id = ? AND direction_id = ?) ORDER BY stop_sequence ASC', [
    route.route_id,
    direction.direction_id
  ]);

  const sortedStopIds = sortStopIdsBySequence(stoptimes);

  // Fetch stop details
  const stops = await gtfs.getStops({ stop_id: sortedStopIds }, ['stop_id', 'stop_name', 'stop_code', 'parent_station']);

  return sortedStopIds.map(stopId => stops.find(stop => stop.stop_id === stopId));
}

/*
 * Generate HTML for transit arrivals widget.
 */
exports.generateTransitArrivalsWidgetHtml = async config => {
  const routes = await gtfs.getRoutes();
  const stops = [];
  const filteredRoutes = [];

  await Promise.all(routes.map(async route => {
    route.route_full_name = formatRouteName(route);

    const directions = await getDirectionsForRoute(route);

    // Filter out routes with no directions
    if (directions.length === 0) {
      config.logWarning(`route_id ${route.route_id} has no directions - skipping`);
      return;
    }

    await Promise.all(directions.map(async direction => {
      const directionStops = await getStopsForDirection(route, direction);
      stops.push(...directionStops);
      direction.stopIds = directionStops.map(stop => stop.stop_id);

      const trips = await gtfs.getTrips({ route_id: route.route_id, direction_id: direction.direction_id }, ['trip_id']);
      direction.trip_ids = trips.map(trip => trip.trip_id);
    }));

    route.directions = directions;
    filteredRoutes.push(route);
  }));

  // Sort twice to handle integers with alphabetical characters, such as ['14', '14L', '14X']
  const sortedRoutes = sortBy(sortBy(filteredRoutes, 'route_short_name'), route => Number.parseInt(route.route_short_name, 10));

  // Sort unique list of stops and indicate parent stations
  const sortedStops = sortBy(uniqBy(stops, 'stop_id'), 'stop_name');
  const parentStationIds = uniqBy(sortedStops, 'parent_station').map(stop => stop.parent_station);

  for (const stop of sortedStops) {
    if (parentStationIds.includes(stop.stop_id)) {
      stop.is_parent_station = true;
    }
  }

  const templateVars = {
    routes: sortedRoutes,
    stops: sortedStops,
    config
  };
  return fileUtils.renderFile('widget', templateVars, config);
};
