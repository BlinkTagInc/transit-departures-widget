import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import yargs from 'yargs'
import { getRoutes, importGtfs, openDb } from 'gtfs'
import { clone, omit } from 'lodash-es'
import untildify from 'untildify'
import express from 'express'
import logger from 'morgan'

import {
  setDefaultConfig,
  generateTransitDeparturesWidgetHtml,
  generateTransitDeparturesWidgetJson,
} from '../lib/utils.ts'
import { getPathToViewsFolder } from '../lib/file-utils.ts'

const argv = yargs(process.argv)
  .option('c', {
    alias: 'configPath',
    describe: 'Path to config file',
    default: './config.json',
    type: 'string',
  })
  .parseSync()

const app = express()

const configPath =
  (argv.configPath as string) || join(process.cwd(), 'config.json')
const selectedConfig = JSON.parse(readFileSync(configPath, 'utf8'))

const config = setDefaultConfig(selectedConfig)
// Override noHead config option so full HTML pages are generated
config.noHead = false
config.assetPath = '/'
config.logFunction = console.log

try {
  openDb(config)
  getRoutes()
} catch (error: any) {
  console.log('Importing GTFS')

  try {
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
  } catch (error: any) {
    console.error(
      `Unable to open sqlite database "${config.sqlitePath}" defined as \`sqlitePath\` config.json. Ensure the parent directory exists and import GTFS before running this app.`,
    )
    throw error
  }
}

/*
 * Show the transit departures widget
 */
app.get('/', async (request, response, next) => {
  try {
    const html = await generateTransitDeparturesWidgetHtml(config)
    response.send(html)
  } catch (error) {
    next(error)
  }
})

/*
 * Provide data
 */
app.get('/data/routes.json', async (request, response, next) => {
  try {
    const { routes } = await generateTransitDeparturesWidgetJson(config)
    response.json(routes)
  } catch (error) {
    next(error)
  }
})

app.get('/data/stops.json', async (request, response, next) => {
  try {
    const { stops } = await generateTransitDeparturesWidgetJson(config)
    response.json(stops)
  } catch (error) {
    next(error)
  }
})

app.set('views', getPathToViewsFolder(config))
app.set('view engine', 'pug')

app.use(logger('dev'))

// Serve static assets
const staticAssetPath =
  config.templatePath === undefined
    ? getPathToViewsFolder(config)
    : untildify(config.templatePath)

app.use(express.static(staticAssetPath))

// Fallback 404 route
app.use((req, res) => {
  res.status(404).send('Not Found')
})

// Error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error(err.stack)
    res.status(500).send('Something broke!')
  },
)

const startServer = async (port: number): Promise<void> => {
  try {
    await new Promise<void>((resolve, reject) => {
      const server = app
        .listen(port)
        .once('listening', () => {
          console.log(`Express server listening on port ${port}`)
          resolve()
        })
        .once('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            console.log(`Port ${port} is in use, trying ${port + 1}`)
            server.close()
            resolve(startServer(port + 1))
          } else {
            reject(err)
          }
        })
    })
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
startServer(port)
