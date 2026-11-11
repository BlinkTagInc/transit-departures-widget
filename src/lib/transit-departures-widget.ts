import path from 'path'
import { writeFile } from 'node:fs/promises'
import { openGtfs } from './gtfs.ts'
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

  if (!config.agency) {
    throw new Error('No agency defined in `config.json`')
  }

  const timer = new Timer()
  const agencyKey = config.agency.agency_key ?? 'unknown'

  const outputPath = config.outputPath
    ? untildify(config.outputPath)
    : path.join(process.cwd(), 'html', sanitize(agencyKey))

  timer.start()

  const gtfs = await openGtfs(config)
  try {
    await prepDirectory(outputPath, config)

    if (config.noHead !== true) {
      await copyStaticAssets(config, outputPath)
    }

    logger.info(`${agencyKey}: Generating Transit Departures Widget HTML`)

    config.assetPath = ''

    // Generate JSON of routes and stops
    const { routes, stops } = await generateTransitDeparturesWidgetJson(
      config,
      gtfs,
    )
    await writeFile(
      path.join(outputPath, 'data', 'routes.json'),
      JSON.stringify(routes),
    )
    await writeFile(
      path.join(outputPath, 'data', 'stops.json'),
      JSON.stringify(stops),
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
  } finally {
    await gtfs.close()
  }
}

export default transitDeparturesWidget
