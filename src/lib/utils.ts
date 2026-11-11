import type { Gtfs } from 'gtfs'
import { getSourceId } from './gtfs.ts'
import { groupBy, last, maxBy, size, sortBy, uniqBy } from 'lodash-es'
import { renderFile } from './file-utils.ts'
import toposort from 'toposort'

import { Config } from '../types/global_interfaces.ts'
import {
  ConfigWithI18n,
  GTFSCalendar,
  GTFSRoute,
  GTFSRouteDirection,
  GTFSStop,
} from '../types/gtfs.ts'
import { createLogger } from './logging/log.ts'
import { messages } from './logging/messages.ts'
export { setDefaultConfig } from './config/defaults.ts'

/*
 * Get calendars for a specified date range
 */
const getCalendarsForDateRange = async (
  config: Config,
  gtfs: Gtfs,
): Promise<GTFSCalendar[]> => {
  const calendars = await gtfs.schedule.calendar.all()
  return calendars.filter(
    (calendar) =>
      (!config.endDate || calendar.start_date <= Number(config.endDate)) &&
      (!config.startDate || calendar.end_date >= Number(config.startDate)),
  )
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
async function getDirectionsForRoute(
  route: GTFSRoute,
  config: ConfigWithI18n,
  gtfs: Gtfs,
) {
  const logger = createLogger(config)

  // Lookup direction names from non-standard directions.txt file
  const directions: { direction_id: number | null; direction: string }[] =
    await gtfs.gtfsPlus.directions
      .where({ route_id: route.route_id })
      .select('direction_id', 'direction')
      .all()

  const calendars = await getCalendarsForDateRange(config, gtfs)
  if (calendars.length === 0) {
    logger.warn(messages.noActiveCalendarsForRoute(route.route_id))
    return []
  }

  // Else use the most common headsigns as directions from trips.txt file
  if (directions.length === 0) {
    const headsigns = await gtfs.database.withKysely({
      callback: (db) =>
        db
          .selectFrom('trips')
          .select(['direction_id', 'trip_headsign'])
          .select((eb) => eb.fn.count<number>('trip_id').as('count'))
          .where('source_id', '=', getSourceId(config))
          .where('route_id', '=', route.route_id)
          .where(
            'service_id',
            'in',
            calendars.map((calendar) => calendar.service_id),
          )
          .groupBy(['direction_id', 'trip_headsign'])
          .orderBy('direction_id')
          .orderBy('trip_headsign')
          .execute(),
    })

    for (const group of Object.values(groupBy(headsigns, 'direction_id'))) {
      const mostCommonHeadsign = maxBy(group, 'count')!
      directions.push({
        direction_id: mostCommonHeadsign.direction_id,
        direction: config.__('To {{{headsign}}}', {
          headsign: mostCommonHeadsign.trip_headsign ?? '',
        }),
      })
    }
  }

  return directions
}

/*
 * Sort an array of stoptimes by stop_sequence using a directed graph
 */
function sortStopIdsBySequence(
  stoptimes: { trip_id: string; stop_id: string; stop_sequence: number }[],
) {
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

async function getStopsForDirection(
  route: GTFSRoute,
  direction: GTFSRouteDirection,
  config: Config,
  gtfs: Gtfs,
  stopCache?: Map<string, GTFSStop>,
) {
  const logger = createLogger(config)
  const calendars = await getCalendarsForDateRange(config, gtfs)
  if (calendars.length === 0) {
    logger.warn(
      messages.noActiveCalendarsForDirection(
        route.route_id,
        direction.direction_id ?? 'null',
      ),
    )
    return []
  }
  const stoptimes = await gtfs.database.withKysely({
    callback: (db) =>
      db
        .selectFrom('stop_times as st')
        .innerJoin('trips as t', (join) =>
          join
            .onRef('st.source_id', '=', 't.source_id')
            .onRef('st.trip_id', '=', 't.trip_id'),
        )
        .select(['st.stop_id', 'st.stop_sequence', 'st.trip_id'])
        .where('st.source_id', '=', getSourceId(config))
        .where('t.route_id', '=', route.route_id)
        .where(
          't.direction_id',
          direction.direction_id === null ? 'is' : '=',
          direction.direction_id,
        )
        .where(
          't.service_id',
          'in',
          calendars.map((calendar) => calendar.service_id),
        )
        .orderBy('st.stop_sequence', 'asc')
        .execute(),
  })

  const sortedStopIds = sortStopIdsBySequence(
    stoptimes.filter(
      (row): row is typeof row & { stop_id: string } => row.stop_id !== null,
    ),
  )

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
  const stopFields: (
    | 'stop_id'
    | 'stop_name'
    | 'stop_code'
    | 'parent_station'
    | 'stop_lat'
    | 'stop_lon'
  )[] = ['stop_id', 'stop_name', 'stop_code', 'parent_station']

  if (config.includeCoordinates) {
    stopFields.push('stop_lat', 'stop_lon')
  }

  const missingStopIds = stopCache
    ? deduplicatedStopIds.filter((stopId) => !stopCache.has(stopId))
    : deduplicatedStopIds

  const fetchedStops = missingStopIds.length
    ? await gtfs.database.withKysely({
        callback: (db) =>
          db
            .selectFrom('stops')
            .select(stopFields)
            .where('source_id', '=', getSourceId(config))
            .where('stop_id', 'in', missingStopIds)
            .execute(),
      })
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
        logger.warn(
          messages.stopNotFound(
            route.route_id,
            direction.direction_id ?? 'null',
            stopId,
          ),
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
export async function generateTransitDeparturesWidgetJson(
  config: ConfigWithI18n,
  gtfs: Gtfs,
) {
  const logger = createLogger(config)
  const calendars = await getCalendarsForDateRange(config, gtfs)
  if (calendars.length === 0) {
    logger.warn(messages.noActiveCalendarsGlobal)
    return { routes: [], stops: [] }
  }

  const routes = await gtfs.schedule.routes
    .select(
      'route_id',
      'agency_id',
      'route_short_name',
      'route_long_name',
      'route_desc',
      'route_type',
      'route_url',
      'route_color',
      'route_text_color',
      'route_sort_order',
      'continuous_pickup',
      'continuous_drop_off',
      'network_id',
    )
    .all()
  const stops: GTFSStop[] = []
  const filteredRoutes: GTFSRoute[] = []
  const stopCache = new Map<string, GTFSStop>()

  for (const route of routes) {
    const routeWithFullName: GTFSRoute = {
      ...route,
      route_full_name: formatRouteName(route),
    }

    const directions = await getDirectionsForRoute(
      routeWithFullName,
      config,
      gtfs,
    )

    // Filter out routes with no directions
    if (directions.length === 0) {
      logger.warn(messages.routeHasNoDirections(route.route_id))
      continue
    }

    const directionsWithData = (
      await Promise.all(
        directions.map(async (direction) => {
          const directionStops = await getStopsForDirection(
            routeWithFullName,
            direction,
            config,
            gtfs,
            stopCache,
          )

          if (directionStops.length === 0) {
            return null
          }

          stops.push(...directionStops)

          const trips = await gtfs.database.withKysely({
            callback: (db) =>
              db
                .selectFrom('trips')
                .select('trip_id')
                .where('source_id', '=', getSourceId(config))
                .where('route_id', '=', route.route_id)
                .where(
                  'direction_id',
                  direction.direction_id === null ? 'is' : '=',
                  direction.direction_id,
                )
                .where(
                  'service_id',
                  'in',
                  calendars.map((calendar) => calendar.service_id),
                )
                .orderBy('trip_id')
                .execute(),
          })

          return {
            ...direction,
            stopIds: directionStops.map((stop) => stop.stop_id),
            tripIds: trips.map((trip) => trip.trip_id),
          }
        }),
      )
    ).filter(Boolean) as GTFSRouteDirection[]

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
  const parentStationIds = [
    ...new Set(stops.map((stop) => stop.parent_station)),
  ].filter((id): id is string => Boolean(id))
  const parentStationStops = parentStationIds.length
    ? await gtfs.database.withKysely({
        callback: (db) =>
          db
            .selectFrom('stops')
            .select(['stop_id', 'stop_name', 'stop_code', 'parent_station'])
            .where('source_id', '=', getSourceId(config))
            .where('stop_id', 'in', parentStationIds)
            .execute(),
      })
    : []

  stops.push(
    ...parentStationStops.map((stop) => ({
      ...stop,
      is_parent_station: true,
    })),
  )

  // Sort unique list of stops
  const sortedStops = sortBy(uniqBy(stops, 'stop_id'), 'stop_name')

  return {
    routes: arrayOfArrays(removeNulls(sortedRoutes)),
    stops: arrayOfArrays(removeNulls(sortedStops)),
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

/*
 * Convert an array of objects into an Array-of-arrays JSON: { "fields": [...], "rows": [[...], ...] }
 */
function arrayOfArrays(array: any[]): { fields: string[]; rows: any[][] } {
  if (array.length === 0) {
    return { fields: [], rows: [] }
  }

  const fields: string[] = Array.from(
    array.reduce<Set<string>>((fieldSet, item) => {
      Object.keys(item ?? {}).forEach((key) => fieldSet.add(key))
      return fieldSet
    }, new Set<string>()),
  )

  return {
    fields,
    rows: array.map((item) => fields.map((field) => item?.[field] ?? null)),
  }
}
