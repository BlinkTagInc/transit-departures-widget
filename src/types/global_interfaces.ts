export interface Config {
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
  outputPath?: string
  overwriteExistingFiles?: boolean
  refreshIntervalSeconds?: number
  skipImport?: boolean
  sqlitePath?: string
  templatePath?: string
  timeFormat?: string
  verbose?: boolean
  logFunction?: (text: string) => void
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
