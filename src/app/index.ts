import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { openGtfs } from '../lib/gtfs.ts'
import express from 'express'
import untildify from 'untildify'

import { getPathToViewsFolder } from '../lib/file-utils.js'
import {
  setDefaultConfig,
  generateTransitDeparturesWidgetHtml,
  generateTransitDeparturesWidgetJson,
} from '../lib/utils.js'

const argv = yargs(hideBin(process.argv))
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

const gtfs = await openGtfs(config)

app.set('views', getPathToViewsFolder(config))
app.set('view engine', 'pug')

// Logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`)
  next()
})

// Serve static assets
const staticAssetPath =
  config.templatePath === undefined
    ? getPathToViewsFolder(config)
    : untildify(config.templatePath)

app.use(express.static(staticAssetPath))

const browserAssetsPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../browser',
)

app.use('/js', express.static(browserAssetsPath))
app.use('/css', express.static(browserAssetsPath))

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
    const { routes } = await generateTransitDeparturesWidgetJson(config, gtfs)
    response.json(routes)
  } catch (error) {
    next(error)
  }
})

app.get('/data/stops.json', async (request, response, next) => {
  try {
    const { stops } = await generateTransitDeparturesWidgetJson(config, gtfs)
    response.json(stops)
  } catch (error) {
    next(error)
  }
})

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
          for (const signal of ['SIGINT', 'SIGTERM'] as const) {
            process.once(signal, () => {
              server.close(async () => {
                await gtfs.close()
              })
            })
          }
          server.once('close', () => {
            void gtfs.close()
          })
          const address = server.address()
          const listeningPort =
            typeof address === 'object' && address ? address.port : port
          console.log(`Express server listening on port ${listeningPort}`)
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
    await gtfs.close()
    process.exitCode = 1
  }
}

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
await startServer(port)
