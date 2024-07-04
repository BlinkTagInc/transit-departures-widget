import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import yargs from 'yargs'
import { openDb } from 'gtfs'

import express, { Router } from 'express'
import logger from 'morgan'

import {
  setDefaultConfig,
  generateTransitDeparturesWidgetHtml,
  generateTransitDeparturesWidgetJson,
} from '../lib/utils.ts'

const argv = yargs(process.argv)
  .option('c', {
    alias: 'configPath',
    describe: 'Path to config file',
    default: './config.json',
    type: 'string',
  })
  .parseSync()

const app = express()
const router = Router()

const configPath = (argv.configPath ||
  new URL('../../config.json', import.meta.url)) as string

const selectedConfig = JSON.parse(readFileSync(configPath).toString())

const config = setDefaultConfig(selectedConfig)
// Override noHead config option so full HTML pages are generated
config.noHead = false
config.assetPath = '/'
config.log = console.log
config.logWarning = console.warn
config.logError = console.error

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

/*
 * Show the transit departures widget
 */
router.get('/', async (request, response, next) => {
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
router.get('/data/routes.json', async (request, response, next) => {
  try {
    const { routes } = await generateTransitDeparturesWidgetJson(config)
    response.json(routes)
  } catch (error) {
    next(error)
  }
})

router.get('/data/stops.json', async (request, response, next) => {
  try {
    const { stops } = await generateTransitDeparturesWidgetJson(config)
    response.json(stops)
  } catch (error) {
    next(error)
  }
})

app.set('views', path.join(fileURLToPath(import.meta.url), '../../../views'))
app.set('view engine', 'pug')

app.use(logger('dev'))
app.use(
  express.static(path.join(fileURLToPath(import.meta.url), '../../../public')),
)

app.use('/', router)
app.set('port', process.env.PORT || 3000)

const server = app.listen(app.get('port'), () => {
  console.log(`Express server listening on port ${app.get('port')}`)
})
