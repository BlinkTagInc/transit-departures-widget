import path from 'path'
import { clone, omit } from 'lodash-es'
import { writeFile } from 'node:fs/promises'
import { importGtfs, openDb, type ConfigAgency } from 'gtfs'
import sanitize from 'sanitize-filename'
import Timer from 'timer-machine'
import untildify from 'untildify'

import { copyStaticAssets, prepDirectory } from './file-utils.ts'
import { createLogger } from './logging/log.ts'
import { setDefaultConfig } from './config/defaults.ts'
import {
  generateTransitDeparturesWidgetHtml,
  generateTransitDeparturesWidgetJson,
} from './utils.ts'
import { Config } from '../types/global_interfaces.ts'

/*
 * Generate transit departures widget HTML from GTFS.
 */
async function transitDeparturesWidget(initialConfig: Config) {
  const config = setDefaultConfig(initialConfig)
  const logger = createLogger(config)

  try {
    openDb(config)
  } catch (error: any) {
    if (error?.code === 'SQLITE_CANTOPEN') {
      logger.error(
        `Unable to open sqlite database "${config.sqlitePath}" defined as \`sqlitePath\` config.json. Ensure the parent directory exists or remove \`sqlitePath\` from config.json.`,
      )
    }

    throw error
  }

  if (!config.agency) {
    throw new Error('No agency defined in `config.json`')
  }

  const timer = new Timer()
  const agencyKey = config.agency.agency_key ?? 'unknown'

  const outputPath = config.outputPath
    ? untildify(config.outputPath)
    : path.join(process.cwd(), 'html', sanitize(agencyKey))

  timer.start()

  if (!config.skipImport) {
    // Import GTFS
    const gtfsPath = config.agency.gtfs_static_path
    const gtfsUrl = config.agency.gtfs_static_url

    if (!gtfsPath && !gtfsUrl) {
      throw new Error(
        'Missing GTFS source. Set `agency.gtfs_static_path` or `agency.gtfs_static_url` in config.json.',
      )
    }

    const agencyImportConfig: ConfigAgency = gtfsPath
      ? { path: gtfsPath }
      : { url: gtfsUrl as string }

    const gtfsImportConfig = {
      ...clone(omit(config, 'agency')),
      agencies: [agencyImportConfig],
    }

    await importGtfs(gtfsImportConfig)
  }

  await prepDirectory(outputPath, config)

  if (config.noHead !== true) {
    await copyStaticAssets(config, outputPath)
  }

  logger.info(`${agencyKey}: Generating Transit Departures Widget HTML`)

  config.assetPath = ''

  // Generate JSON of routes and stops
  const { routes, stops } = generateTransitDeparturesWidgetJson(config)
  await writeFile(
    path.join(outputPath, 'data', 'routes.json'),
    JSON.stringify(routes, null, 2),
  )
  await writeFile(
    path.join(outputPath, 'data', 'stops.json'),
    JSON.stringify(stops, null, 2),
  )

  const html = await generateTransitDeparturesWidgetHtml(config)
  await writeFile(path.join(outputPath, 'index.html'), html)

  timer.stop()

  // Print stats
  logger.info(
    `${agencyKey}: Transit Departures Widget HTML created at ${outputPath}`,
  )

  const seconds = Math.round(timer.time() / 1000)
  logger.info(`${agencyKey}: HTML generation required ${seconds} seconds`)
}

export default transitDeparturesWidget
