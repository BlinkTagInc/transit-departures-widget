import { Gtfs, type GtfsScheduleSourceConfig } from 'gtfs'
import untildify from 'untildify'
import type { Config } from '../types/global_interfaces.ts'

export function getSourceId(config: Config): string {
  const sourceId = config.agency.sourceId ?? config.agency.agency_key
  if (!sourceId?.trim()) {
    throw new Error('Set agency.sourceId or a stable agency.agency_key')
  }
  return sourceId
}

// Only node-GTFS options cross this boundary. The widget owns its config.
export async function openGtfs(config: Config): Promise<Gtfs> {
  if (!config.agency) {
    throw new Error('No agency defined in `config.json`')
  }
  if (
    config.skipImport &&
    (!config.sqlitePath || config.sqlitePath === ':memory:')
  ) {
    throw new Error('skipImport requires a persistent v5 sqlitePath')
  }
  const sourceId = getSourceId(config)
  const gtfs = new Gtfs({
    database: { path: untildify(config.sqlitePath ?? ':memory:') },
    sources: [{ sourceId }],
    extensions: ['gtfs-plus'],
  })
  try {
    if (!config.skipImport) {
      const { gtfs_static_path: path, gtfs_static_url: url } = config.agency
      if (!path && !url) {
        throw new Error(
          'Missing GTFS source. Set agency.gtfs_static_path or agency.gtfs_static_url',
        )
      }
      const excludeFiles = config.agency.exclude?.map((name) =>
        name.includes('.') ? name : `${name}.txt`,
      ) as GtfsScheduleSourceConfig['excludeFiles']
      const schedule: GtfsScheduleSourceConfig = path
        ? { path: untildify(path), excludeFiles }
        : { url: url!, excludeFiles }
      const result = await gtfs.import({ sources: [{ sourceId, schedule }] })
      if (!result.success) {
        throw new Error(`GTFS import failed: ${JSON.stringify(result.errors)}`)
      }
    }
    // Also detects an empty database or a mismatched source when reusing one.
    if ((await gtfs.schedule.agency.count()) === 0) {
      throw new Error(
        `No imported agency for source ${sourceId}; import into a fresh v5 database first`,
      )
    }
    return gtfs
  } catch (error) {
    await gtfs.close()
    throw error
  }
}
