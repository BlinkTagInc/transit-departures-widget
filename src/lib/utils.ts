import { join } from 'path'
import { openDb, getDirections, getRoutes, getStops, getTrips } from 'gtfs'
import { groupBy, last, maxBy, size, sortBy, uniqBy } from 'lodash-es'
import { getPathToViewsFolder, renderFile } from './file-utils.ts'
import sqlString from 'sqlstring-sqlite'
import toposort from 'toposort'
import { I18n } from 'i18n'

import { Config, SqlWhere, SqlValue } from '../types/global_interfaces.ts'
import { logWarning } from './log-utils.ts'

/*
 * Get calendars for a specified date range
 */
const getCalendarsForDateRange = (config: Config) => {
  const db = openDb(config)
  let whereClause = ''
  const whereClauses = []

  if (config.endDate) {
    whereClauses.push(`start_date <= ${sqlString.escape(config.endDate)}`)
  }

  if (config.startDate) {
    whereClauses.push(`end_date >= ${sqlString.escape(config.startDate)}`)
  }

  if (whereClauses.length > 0) {
    whereClause = `WHERE ${whereClauses.join(' AND ')}`
  }

  return db.prepare(`SELECT * FROM calendar ${whereClause}`).all()
}

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
function getDirectionsForRoute(
  route: Record<string, string>,
  config: Config & { __: I18n['__'] },
) {
  const db = openDb(config)

  // Lookup direction names from non-standard directions.txt file
  const directions = getDirections({ route_id: route.route_id }, [
    'direction_id',
    'direction',
  ])

  const calendars = getCalendarsForDateRange(config)

  // Else use the most common headsigns as directions from trips.txt file
  if (directions.length === 0) {
    const headsigns = db
      .prepare(
        `SELECT direction_id, trip_headsign, count(*) AS count FROM trips WHERE route_id = ? AND service_id IN (${calendars
          .map((calendar: Record<string, string>) => `'${calendar.service_id}'`)
          .join(', ')}) GROUP BY direction_id, trip_headsign`,
      )
      .all(route.route_id)

    for (const group of Object.values(groupBy(headsigns, 'direction_id'))) {
      const mostCommonHeadsign = maxBy(group, 'count')
      directions.push({
        direction_id: mostCommonHeadsign.direction_id,
        direction: config.__('To {{{headsign}}}', {
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
function sortStopIdsBySequence(stoptimes: Record<string, string>[]) {
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

    return toposort(
      stopGraph as unknown as readonly [string, string | undefined][],
    )
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
function getStopsForDirection(route, direction, config: Config) {
  const db = openDb(config)
  const calendars = getCalendarsForDateRange(config)
  const whereClause = formatWhereClauses({
    direction_id: direction.direction_id,
    route_id: route.route_id,
    service_id: calendars.map((calendar) => calendar.service_id),
  })
  const stoptimes = db
    .prepare(
      `SELECT stop_id, stop_sequence, trip_id FROM stop_times WHERE trip_id IN (SELECT trip_id FROM trips ${whereClause}) ORDER BY stop_sequence ASC`,
    )
    .all()

  const sortedStopIds = sortStopIdsBySequence(stoptimes)

  const deduplicatedStopIds = sortedStopIds.reduce(
    (memo: string[], stopId: string) => {
      // Remove duplicated stop_ids in a row
      if (last(memo) !== stopId) {
        memo.push(stopId)
      }

      return memo
    },
    [],
  )

  // Remove last stop of route since boarding is not allowed
  deduplicatedStopIds.pop()

  // Fetch stop details

  const stopFields = ['stop_id', 'stop_name', 'stop_code', 'parent_station']

  if (config.includeCoordinates) {
    stopFields.push('stop_lat', 'stop_lon')
  }

  const stops = getStops({ stop_id: deduplicatedStopIds }, stopFields)

  return deduplicatedStopIds.map((stopId: string) =>
    stops.find((stop) => stop.stop_id === stopId),
  )
}

/*
 * Generate HTML for transit departures widget.
 */
export function generateTransitDeparturesWidgetHtml(config: Config) {
  const templateVars = {
    config,
    __: config.__,
  }
  return renderFile('widget', templateVars, config)
}

/*
 * Generate JSON of routes and stops for transit departures widget.
 */
export function generateTransitDeparturesWidgetJson(config: Config) {
  const routes = getRoutes()
  const stops = []
  const filteredRoutes = []
  const calendars = getCalendarsForDateRange(config)

  for (const route of routes) {
    route.route_full_name = formatRouteName(route)

    const directions = getDirectionsForRoute(route, config)

    // Filter out routes with no directions
    if (directions.length === 0) {
      logWarning(config)(
        `route_id ${route.route_id} has no directions - skipping`,
      )
      continue
    }

    for (const direction of directions) {
      const directionStops = getStopsForDirection(route, direction, config)
      stops.push(...directionStops)
      direction.stopIds = directionStops.map((stop) => stop?.stop_id)

      const trips = getTrips(
        {
          route_id: route.route_id,
          direction_id: direction.direction_id,
          service_id: calendars.map(
            (calendar: Record<string, string>) => calendar.service_id,
          ),
        },
        ['trip_id'],
      )
      direction.tripIds = trips.map((trip) => trip.trip_id)
    }

    route.directions = directions
    filteredRoutes.push(route)
  }

  // Sort routes twice to handle integers with alphabetical characters, such as ['14', '14L', '14X']
  const sortedRoutes = sortBy(
    sortBy(filteredRoutes, (route) => route.route_short_name?.toLowerCase()),
    (route) => Number.parseInt(route.route_short_name, 10),
  )

  // Get Parent Station Stops
  const parentStationIds = new Set(stops.map((stop) => stop?.parent_station))

  const parentStationStops = getStops(
    { stop_id: Array.from(parentStationIds) },
    ['stop_id', 'stop_name', 'stop_code', 'parent_station'],
  )

  stops.push(
    ...parentStationStops.map((stop) => {
      stop.is_parent_station = true
      return stop
    }),
  )

  // Sort unique list of stops
  const sortedStops = sortBy(uniqBy(stops, 'stop_id'), 'stop_name')

  return {
    routes: removeNulls(sortedRoutes),
    stops: removeNulls(sortedStops),
  }
}

/*
 * Remove null values from array or object
 */
function removeNulls(data: any): any {
  if (Array.isArray(data)) {
    return data
      .map(removeNulls)
      .filter((item) => item !== null && item !== undefined)
  } else if (typeof data === 'object' && data !== null) {
    return Object.entries(data).reduce((acc, [key, value]) => {
      const cleanedValue = removeNulls(value)
      if (cleanedValue !== null && cleanedValue !== undefined) {
        acc[key] = cleanedValue
      }
      return acc
    }, {})
  } else {
    return data
  }
}

/*
 * Initialize configuration with defaults.
 */
export function setDefaultConfig(initialConfig: Config) {
  const defaults = {
    beautify: false,
    noHead: false,
    refreshIntervalSeconds: 20,
    skipImport: false,
    timeFormat: '12hour',
    includeCoordinates: false,
    overwriteExistingFiles: true,
    verbose: true,
  }

  const config = Object.assign(defaults, initialConfig)
  const viewsFolderPath = getPathToViewsFolder(config)
  const i18n = new I18n({
    directory: join(viewsFolderPath, 'locales'),
    defaultLocale: config.locale,
    updateFiles: false,
  })
  const configWithI18n = Object.assign(config, {
    __: i18n.__,
  })
  return configWithI18n
}

export function formatWhereClause(
  key: string,
  value: null | SqlValue | SqlValue[],
) {
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

export function formatWhereClauses(query: SqlWhere) {
  if (Object.keys(query).length === 0) {
    return ''
  }

  const whereClauses = Object.entries(query).map(([key, value]) =>
    formatWhereClause(key, value),
  )
  return `WHERE ${whereClauses.join(' AND ')}`
}
