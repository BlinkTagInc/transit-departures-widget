export interface IConfig {
  agency: {
    agency_key: string
    gtfs_static_path?: string
    gtfs_static_url?: string
    gtfs_rt_tripupdates_url: string
    gtfs_rt_tripupdates_headers?: Record<string, string>
    exclude?: string[]
  }
  assetPath?: string
  beautify?: boolean
  startDate?: string
  endDate?: string
  locale?: string
  includeCoordinates?: boolean
  noHead?: boolean
  refreshIntervalSeconds?: number
  skipImport?: boolean
  sqlitePath?: string
  templatePath?: string
  timeFormat?: string
  log: (text: string) => void
  logWarning: (text: string) => void
  logError: (text: string) => void
}

export type SqlValue =
  | undefined
  | null
  | string
  | number
  | boolean
  | Date
  | SqlValue[]

export type SqlWhere = Record<string, null | SqlValue | SqlValue[]>
