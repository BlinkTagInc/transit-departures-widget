import path from 'path'
import { clone, omit } from 'lodash-es'
import { writeFile } from 'node:fs/promises'
import { importGtfs, openDb } from 'gtfs'
import sanitize from 'sanitize-filename'
import Timer from 'timer-machine'

import { copyStaticAssets, prepDirectory } from './file-utils.ts'
import { log, logWarning, logError } from './log-utils.ts'
import {
  generateTransitDeparturesWidgetHtml,
  generateTransitDeparturesWidgetJson,
  setDefaultConfig,
} from './utils.ts'
import { IConfig } from '../types/global_interfaces.ts'

/*
 * Generate transit departures widget HTML from GTFS.
 */
async function transitDeparturesWidget(initialConfig: IConfig) {
  const config = setDefaultConfig(initialConfig)
  config.log = log(config)
  config.logWarning = logWarning(config)
  config.logError = logError(config)

  try {
    openDb(config)
  } catch (error: any) {
    if (error?.code === 'SQLITE_CANTOPEN') {
      config.logError(
        `Unable to open sqlite database "${config.sqlitePath}" defined as \`sqlitePath\` config.json. Ensure the parent directory exists or remove \`sqlitePath\` from config.json.`,
      )
    }

    throw error
  }

  if (!config.agency) {
    throw new Error('No agency defined in `config.json`')
  }

  const timer = new Timer()
  const agencyKey = config.agency.agency_key
  const exportPath = path.join(process.cwd(), 'html', sanitize(agencyKey))

  timer.start()

  if (!config.skipImport) {
    // Import GTFS
    const gtfsImportConfig = {
      ...clone(omit(config, 'agency')),
      agencies: [
        {
          agency_key: config.agency.agency_key,
          path: config.agency.gtfs_static_path,
          url: config.agency.gtfs_static_url,
        },
      ],
    }

    await importGtfs(gtfsImportConfig)
  }

  await prepDirectory(exportPath)
  await prepDirectory(path.join(exportPath, 'data'))

  if (config.noHead !== true) {
    copyStaticAssets(exportPath)
  }

  config.log(`${agencyKey}: Generating Transit Departures Widget HTML`)

  config.assetPath = ''

  // Generate JSON of routes and stops
  const { routes, stops } = generateTransitDeparturesWidgetJson(config)
  await writeFile(
    path.join(exportPath, 'data', 'routes.json'),
    JSON.stringify(routes, null, 2),
  )
  await writeFile(
    path.join(exportPath, 'data', 'stops.json'),
    JSON.stringify(stops, null, 2),
  )

  const html = await generateTransitDeparturesWidgetHtml(config)
  await writeFile(path.join(exportPath, 'index.html'), html)

  timer.stop()

  // Print stats
  config.log(
    `${agencyKey}: Transit Departures Widget HTML created at ${exportPath}`,
  )

  const seconds = Math.round(timer.time() / 1000)
  config.log(`${agencyKey}: HTML generation required ${seconds} seconds`)
}

export default transitDeparturesWidget
