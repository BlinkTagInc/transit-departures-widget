import { openDb, getDirections, getRoutes, getStops, getTrips } from 'gtfs'
import { groupBy, last, maxBy, size, sortBy, uniqBy } from 'lodash-es'
import { renderFile } from './file-utils.ts'
import sqlString from 'sqlstring-sqlite'
import toposort from 'toposort'

import { Config, SqlWhere, SqlValue } from '../types/global_interfaces.ts'
import {
  ConfigWithI18n,
  GTFSCalendar,
  GTFSRoute,
  GTFSRouteDirection,
  GTFSStop,
} from '../types/gtfs.ts'
import { logWarning } from './logging/log.ts'
export { setDefaultConfig } from './config/defaults.ts'

/*
 * Get calendars for a specified date range
 */
const getCalendarsForDateRange = (config: Config): GTFSCalendar[] => {
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
function formatRouteName(route: GTFSRoute) {
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
function getDirectionsForRoute(route: GTFSRoute, config: ConfigWithI18n) {
  const db = openDb(config)

  // Lookup direction names from non-standard directions.txt file
  const directions = getDirections({ route_id: route.route_id }, [
    'direction_id',
    'direction',
  ])
    .filter((direction) => direction.direction_id !== undefined)
    .map((direction) => ({
      direction_id: direction.direction_id as number | string,
      direction: direction.direction,
    }))

  const calendars = getCalendarsForDateRange(config)
  if (calendars.length === 0) {
    logWarning(config)(
      `route_id ${route.route_id} has no active calendars in range - skipping directions`,
    )
    return []
  }

  // Else use the most common headsigns as directions from trips.txt file
  if (directions.length === 0) {
    const headsigns = db
      .prepare(
        `SELECT direction_id, trip_headsign, count(*) AS count FROM trips WHERE route_id = ? AND service_id IN (${calendars
          .map((calendar: GTFSCalendar) => `'${calendar.service_id}'`)
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

  if (!longestTripStoptimes) {
    return []
  }

  return longestTripStoptimes.map((stoptime) => stoptime.stop_id)
}

function getStopsForDirection(
  route: GTFSRoute,
  direction: GTFSRouteDirection,
  config: Config,
  stopCache?: Map<string, GTFSStop>,
) {
  const db = openDb(config)
  const calendars = getCalendarsForDateRange(config)
  if (calendars.length === 0) {
    logWarning(config)(
      `route_id ${route.route_id} direction ${direction.direction_id} has no active calendars in range - skipping stops`,
    )
    return []
  }
  const whereClause = formatWhereClauses({
    direction_id: direction.direction_id,
    route_id: route.route_id,
    service_id: calendars.map((calendar: GTFSCalendar) => calendar.service_id),
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
  const stopFields: (keyof GTFSStop)[] = [
    'stop_id',
    'stop_name',
    'stop_code',
    'parent_station',
  ]

  if (config.includeCoordinates) {
    stopFields.push('stop_lat', 'stop_lon')
  }

  const missingStopIds = stopCache
    ? deduplicatedStopIds.filter((stopId) => !stopCache.has(stopId))
    : deduplicatedStopIds

  const fetchedStops = missingStopIds.length
    ? (getStops as unknown as (query: any, fields?: any) => GTFSStop[])(
        { stop_id: missingStopIds },
        stopFields,
      )
    : []

  if (stopCache) {
    for (const stop of fetchedStops) {
      stopCache.set(stop.stop_id, stop)
    }
  }

  return deduplicatedStopIds
    .map((stopId: string) => {
      const stop =
        stopCache?.get(stopId) ??
        fetchedStops.find((candidate) => candidate.stop_id === stopId)

      if (!stop) {
        logWarning(config)(
          `stop_id ${stopId} for route ${route.route_id} direction ${direction.direction_id} not found - dropping`,
        )
      }

      return stop
    })
    .filter(Boolean) as GTFSStop[]
}

/*
 * Generate HTML for transit departures widget.
 */
export function generateTransitDeparturesWidgetHtml(config: ConfigWithI18n) {
  const templateVars = {
    config,
    __: config.__,
  }
  return renderFile('widget', templateVars, config)
}

/*
 * Generate JSON of routes and stops for transit departures widget.
 */
export function generateTransitDeparturesWidgetJson(config: ConfigWithI18n) {
  const calendars = getCalendarsForDateRange(config)
  if (calendars.length === 0) {
    logWarning(config)(
      'No active calendars found for the configured date range - returning empty routes and stops',
    )
    return { routes: [], stops: [] }
  }

  const routes = getRoutes() as GTFSRoute[]
  const stops: GTFSStop[] = []
  const filteredRoutes: GTFSRoute[] = []
  const stopCache = new Map<string, GTFSStop>()

  for (const route of routes) {
    const routeWithFullName: GTFSRoute = {
      ...route,
      route_full_name: formatRouteName(route),
    }

    const directions = getDirectionsForRoute(routeWithFullName, config)

    // Filter out routes with no directions
    if (directions.length === 0) {
      logWarning(config)(
        `route_id ${route.route_id} has no directions - skipping`,
      )
      continue
    }

    const directionsWithData = directions
      .map((direction) => {
        const directionStops = getStopsForDirection(
          routeWithFullName,
          direction,
          config,
          stopCache,
        )

        if (directionStops.length === 0) {
          return null
        }

        stops.push(...directionStops)

        const trips = getTrips(
          {
            route_id: route.route_id,
            direction_id: direction.direction_id,
            service_id: calendars.map(
              (calendar: GTFSCalendar) => calendar.service_id,
            ),
          },
          ['trip_id'],
        )

        return {
          ...direction,
          stopIds: directionStops.map((stop) => stop.stop_id),
          tripIds: trips.map((trip) => trip.trip_id),
        }
      })
      .filter(Boolean) as GTFSRouteDirection[]

    if (directionsWithData.length === 0) {
      continue
    }

    filteredRoutes.push({
      ...routeWithFullName,
      directions: directionsWithData,
    })
  }

  // Sort routes deterministically, handling mixed numeric/alphanumeric IDs
  const sortedRoutes = [...filteredRoutes].sort((a, b) => {
    const aShort = a.route_short_name ?? ''
    const bShort = b.route_short_name ?? ''
    const aNum = Number.parseInt(aShort, 10)
    const bNum = Number.parseInt(bShort, 10)

    if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum) {
      return aNum - bNum
    }

    if (Number.isNaN(aNum) && !Number.isNaN(bNum)) {
      return 1
    }

    if (!Number.isNaN(aNum) && Number.isNaN(bNum)) {
      return -1
    }

    return aShort.localeCompare(bShort, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })

  // Get Parent Station Stops
  const parentStationIds = new Set(stops.map((stop) => stop.parent_station))

  const parentStationStops = getStops(
    { stop_id: Array.from(parentStationIds) },
    ['stop_id', 'stop_name', 'stop_code', 'parent_station'],
  )

  stops.push(
    ...parentStationStops.map((stop) => ({
      ...stop,
      is_parent_station: true,
    })),
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
  } else if (
    data !== null &&
    typeof data === 'object' &&
    Object.getPrototypeOf(data) === Object.prototype
  ) {
    return Object.entries(data).reduce<Record<string, unknown>>(
      (acc, [key, value]) => {
        const cleanedValue = removeNulls(value)
        if (cleanedValue !== null && cleanedValue !== undefined) {
          acc[key] = cleanedValue
        }
        return acc
      },
      {},
    )
  } else {
    return data
  }
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
