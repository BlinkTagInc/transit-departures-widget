import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { openDb, getDirections, getRoutes, getStops, getTrips } from 'gtfs'
import { groupBy, last, maxBy, size, sortBy, uniqBy } from 'lodash-es'
import { renderFile } from './file-utils.js'
import sqlString from 'sqlstring-sqlite'
import toposort from 'toposort'
import i18n from 'i18n'

/*
 * Format a route name.
 */
function formatRouteName(route) {
  let routeName = ''

  if (route.route_short_name !== null) {
    routeName += route.route_short_name
  }

  if (route.route_short_name !== null && route.route_long_name !== null) {
    routeName += ' - '
  }

  if (route.route_long_name !== null) {
    routeName += route.route_long_name
  }

  return routeName
}

/*
 * Get directions for a route
 */
function getDirectionsForRoute(route, config) {
  const db = openDb(config)

  // Lookup direction names from non-standard directions.txt file
  const directions = getDirections({ route_id: route.route_id }, [
    'direction_id',
    'direction',
  ])

  // Else use the most common headsigns as directions from trips.txt file
  if (directions.length === 0) {
    const headsigns = db
      .prepare(
        'SELECT direction_id, trip_headsign, count(*) AS count FROM trips WHERE route_id = ? GROUP BY direction_id, trip_headsign',
      )
      .all(route.route_id)

    for (const group of Object.values(groupBy(headsigns, 'direction_id'))) {
      const mostCommonHeadsign = maxBy(group, 'count')
      directions.push({
        direction_id: mostCommonHeadsign.direction_id,
        direction: i18n.__('To {{{headsign}}}', {
          headsign: mostCommonHeadsign.trip_headsign,
        }),
      })
    }
  }

  return directions
}

/*
 * Sort an array of stoptimes by stop_sequence using a directed graph
 */
function sortStopIdsBySequence(stoptimes) {
  const stoptimesGroupedByTrip = groupBy(stoptimes, 'trip_id')

  // First, try using a directed graph to determine stop order.
  try {
    const stopGraph = []

    for (const tripStoptimes of Object.values(stoptimesGroupedByTrip)) {
      const sortedStopIds = sortBy(tripStoptimes, 'stop_sequence').map(
        (stoptime) => stoptime.stop_id,
      )

      for (const [index, stopId] of sortedStopIds.entries()) {
        if (index === sortedStopIds.length - 1) {
          continue
        }

        stopGraph.push([stopId, sortedStopIds[index + 1]])
      }
    }

    return toposort(stopGraph)
  } catch {
    // Ignore errors and move to next strategy.
  }

  // Finally, fall back to using the stop order from the trip with the most stoptimes.
  const longestTripStoptimes = maxBy(
    Object.values(stoptimesGroupedByTrip),
    (stoptimes) => size(stoptimes),
  )

  return longestTripStoptimes.map((stoptime) => stoptime.stop_id)
}

/*
 * Get stops in order for a route and direction
 */
function getStopsForDirection(route, direction, config) {
  const db = openDb(config)
  const whereClause = formatWhereClauses({
    direction_id: direction.direction_id,
    route_id: route.route_id,
  })
  const stoptimes = db
    .prepare(
      `SELECT stop_id, stop_sequence, trip_id FROM stop_times WHERE trip_id IN (SELECT trip_id FROM trips ${whereClause}) ORDER BY stop_sequence ASC`,
    )
    .all()

  const sortedStopIds = sortStopIdsBySequence(stoptimes)

  const deduplicatedStopIds = sortedStopIds.reduce((memo, stopId) => {
    // Remove duplicated stop_ids in a row
    if (last(memo) !== stopId) {
      memo.push(stopId)
    }

    return memo
  }, [])

  // Fetch stop details
  const stops = getStops({ stop_id: deduplicatedStopIds }, [
    'stop_id',
    'stop_name',
    'stop_code',
    'parent_station',
  ])

  return deduplicatedStopIds.map((stopId) =>
    stops.find((stop) => stop.stop_id === stopId),
  )
}

/*
 * Generate HTML for transit departures widget.
 */
export function generateTransitDeparturesWidgetHtml(config) {
  const routes = getRoutes()
  const stops = []
  const filteredRoutes = []
  i18n.configure({
    directory: join(dirname(fileURLToPath(import.meta.url)), '..', 'locales'),
    defaultLocale: config.locale,
    updateFiles: false,
  })

  for (const route of routes) {
    route.route_full_name = formatRouteName(route)

    const directions = getDirectionsForRoute(route, config)

    // Filter out routes with no directions
    if (directions.length === 0) {
      config.logWarning(
        `route_id ${route.route_id} has no directions - skipping`,
      )
      return
    }

    for (const direction of directions) {
      const directionStops = getStopsForDirection(route, direction, config)
      stops.push(...directionStops)
      direction.stopIds = directionStops.map((stop) => stop.stop_id)

      const trips = getTrips(
        { route_id: route.route_id, direction_id: direction.direction_id },
        ['trip_id'],
      )
      direction.tripIds = trips.map((trip) => trip.trip_id)
    }

    route.directions = directions
    filteredRoutes.push(route)
  }

  // Sort twice to handle integers with alphabetical characters, such as ['14', '14L', '14X']
  const sortedRoutes = sortBy(
    sortBy(filteredRoutes, (route) => route.route_short_name?.toLowerCase()),
    (route) => Number.parseInt(route.route_short_name, 10),
  )

  // Sort unique list of stops and indicate parent stations
  const sortedStops = sortBy(uniqBy(stops, 'stop_id'), 'stop_name')
  const parentStationIds = new Set(
    sortedStops.map((stop) => stop.parent_station),
  )

  for (const stop of sortedStops) {
    if (parentStationIds.has(stop.stop_id)) {
      stop.is_parent_station = true
    }
  }

  const templateVars = {
    __: i18n.__,
    routes: sortedRoutes,
    stops: sortedStops,
    config,
  }
  return renderFile('widget', templateVars, config)
}

/*
 * Initialize configuration with defaults.
 */
export function setDefaultConfig(initialConfig) {
  const defaults = {
    beautify: false,
    noHead: false,
    refreshIntervalSeconds: 20,
    skipImport: false,
    timeFormat: '12hour',
  }

  return Object.assign(defaults, initialConfig)
}

export function formatWhereClause(key, value) {
  if (Array.isArray(value)) {
    let whereClause = `${sqlString.escapeId(key)} IN (${value
      .filter((v) => v !== null)
      .map((v) => sqlString.escape(v))
      .join(', ')})`

    if (value.includes(null)) {
      whereClause = `(${whereClause} OR ${sqlString.escapeId(key)} IS NULL)`
    }

    return whereClause
  }

  if (value === null) {
    return `${sqlString.escapeId(key)} IS NULL`
  }

  return `${sqlString.escapeId(key)} = ${sqlString.escape(value)}`
}

export function formatWhereClauses(query) {
  if (Object.keys(query).length === 0) {
    return ''
  }

  const whereClauses = Object.entries(query).map(([key, value]) =>
    formatWhereClause(key, value),
  )
  return `WHERE ${whereClauses.join(' AND ')}`
}
