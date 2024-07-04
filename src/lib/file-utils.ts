import path from 'path'
import { fileURLToPath } from 'node:url'
import { readFile, rm, mkdir } from 'node:fs/promises'
import copydir from 'copy-dir'
import beautify from 'js-beautify'
import pug from 'pug'
import untildify from 'untildify'

import { IConfig } from '../types/global_interfaces.ts'

/*
 * Attempt to parse the specified config JSON file.
 */
export async function getConfig(argv) {
  try {
    const data = await readFile(
      path.resolve(untildify(argv.configPath)),
      'utf8',
    ).catch((error) => {
      console.error(
        new Error(
          `Cannot find configuration file at \`${argv.configPath}\`. Use config-sample.json as a starting point, pass --configPath option`,
        ),
      )
      throw error
    })
    const config = JSON.parse(data)

    if (argv.skipImport === true) {
      config.skipImport = argv.skipImport
    }

    return config
  } catch (error) {
    console.error(
      new Error(
        `Cannot parse configuration file at \`${argv.configPath}\`. Check to ensure that it is valid JSON.`,
      ),
    )
    throw error
  }
}

/*
 * Get the full path of the template file for generating transit departures widget based on
 * config.
 */
function getTemplatePath(templateFileName, config) {
  let fullTemplateFileName = templateFileName
  if (config.noHead !== true) {
    fullTemplateFileName += '_full'
  }

  if (config.templatePath !== undefined) {
    return path.join(
      untildify(config.templatePath),
      `${fullTemplateFileName}.pug`,
    )
  }

  return path.join(
    fileURLToPath(import.meta.url),
    '../../../views/widget',
    `${fullTemplateFileName}.pug`,
  )
}

/*
 * Prepare the specified directory for saving HTML widget by deleting everything.
 */
export async function prepDirectory(exportPath: string) {
  await rm(exportPath, { recursive: true, force: true })
  try {
    await mkdir(exportPath, { recursive: true })
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        `Unable to write to ${exportPath}. Try running this command from a writable directory.`,
      )
    }

    throw error
  }
}

/*
 * Copy needed CSS and JS to export path.
 */
export function copyStaticAssets(exportPath: string) {
  const staticAssetPath = path.join(
    fileURLToPath(import.meta.url),
    '../../../public',
  )
  copydir.sync(path.join(staticAssetPath, 'img'), path.join(exportPath, 'img'))
  copydir.sync(path.join(staticAssetPath, 'css'), path.join(exportPath, 'css'))
  copydir.sync(path.join(staticAssetPath, 'js'), path.join(exportPath, 'js'))
}

/*
 * Render the HTML based on the config.
 */
export async function renderFile(
  templateFileName: string,
  templateVars: any,
  config: IConfig,
) {
  const templatePath = getTemplatePath(templateFileName, config)
  const html = await pug.renderFile(templatePath, templateVars)

  // Beautify HTML if setting is set
  if (config.beautify === true) {
    return beautify.html_beautify(html, { indent_size: 2 })
  }

  return html
}
