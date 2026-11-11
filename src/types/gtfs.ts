import { I18n } from 'i18n'
import type { Calendar, Stops } from 'gtfs'

import { Config } from './global_interfaces.ts'

export type GTFSCalendar = Calendar

export type GTFSRoute = {
  route_id: string
  route_short_name?: string | null
  route_long_name?: string | null
  route_full_name?: string
  directions?: GTFSRouteDirection[]
}

export type GTFSRouteDirection = {
  direction_id: number | null
  direction: string
  stopIds?: string[]
  tripIds?: string[]
}

export type GTFSStop = Pick<
  Stops,
  'stop_id' | 'stop_name' | 'stop_code' | 'parent_station'
> &
  Partial<Pick<Stops, 'stop_lat' | 'stop_lon'>> & {
    is_parent_station?: boolean
  }

export type ConfigWithI18n = Config & { __: I18n['__'] }
