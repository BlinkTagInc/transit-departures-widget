import { I18n } from 'i18n'
import { Stop } from 'gtfs'

import { Config } from './global_interfaces.ts'

export type GTFSCalendar = Record<string, string>

export type GTFSRoute = {
  route_id: string
  route_short_name?: string | null
  route_long_name?: string | null
  route_full_name?: string
  directions?: GTFSRouteDirection[]
}

export type GTFSRouteDirection = {
  direction_id: number | string
  direction: string
  stopIds?: string[]
  tripIds?: string[]
}

export type GTFSStop = Stop

export type ConfigWithI18n = Config & { __: I18n['__'] }
