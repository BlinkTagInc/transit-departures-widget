export const messages = {
  noActiveCalendarsGlobal:
    'No active calendars found for the configured date range - returning empty routes and stops',
  noActiveCalendarsForRoute: (routeId: string) =>
    `route_id ${routeId} has no active calendars in range - skipping directions`,
  noActiveCalendarsForDirection: (
    routeId: string,
    directionId: string | number,
  ) =>
    `route_id ${routeId} direction ${directionId} has no active calendars in range - skipping stops`,
  routeHasNoDirections: (routeId: string) =>
    `route_id ${routeId} has no directions - skipping`,
  stopNotFound: (
    routeId: string,
    directionId: string | number,
    stopId: string,
  ) =>
    `stop_id ${stopId} for route ${routeId} direction ${directionId} not found - dropping`,
}
