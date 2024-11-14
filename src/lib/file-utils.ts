import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { access, cp, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import beautify from 'js-beautify'
import pug from 'pug'
import untildify from 'untildify'

import { Config } from '../types/global_interfaces.ts'

/*
 * Attempt to parse the specified config JSON file.
 */
export async function getConfig(argv) {
  try {
    const data = await readFile(
      resolve(untildify(argv.configPath)),
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
 * Get the full path to the views folder.
 */
export function getPathToViewsFolder(config: Config) {
  if (config.templatePath) {
    return untildify(config.templatePath)
  }

  const __dirname = dirname(fileURLToPath(import.meta.url))

  // Dynamically calculate the path to the views directory
  let viewsFolderPath
  if (__dirname.endsWith('/dist/bin') || __dirname.endsWith('/dist/app')) {
    // When the file is in 'dist/bin' or 'dist/app'
    viewsFolderPath = resolve(__dirname, '../../views/widget')
  } else if (__dirname.endsWith('/dist')) {
    // When the file is in 'dist'
    viewsFolderPath = resolve(__dirname, '../views/widget')
  } else {
    // In case it's neither, fallback to project root
    viewsFolderPath = resolve(__dirname, 'views/widget')
  }

  return viewsFolderPath
}

/*
 * Get the full path of a template file.
 */
function getPathToTemplateFile(templateFileName: string, config: Config) {
  const fullTemplateFileName =
    config.noHead !== true
      ? `${templateFileName}_full.pug`
      : `${templateFileName}.pug`

  return join(getPathToViewsFolder(config), fullTemplateFileName)
}

/*
 * Prepare the outputPath directory for writing timetable files.
 */
export async function prepDirectory(outputPath: string, config: Config) {
  // Check if outputPath exists
  try {
    await access(outputPath)
  } catch (error: any) {
    try {
      await mkdir(outputPath, { recursive: true })
      await mkdir(join(outputPath, 'data'))
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new Error(
          `Unable to write to ${outputPath}. Try running this command from a writable directory.`,
        )
      }

      throw error
    }
  }

  // Check if outputPath is empty
  const files = await readdir(outputPath)
  if (config.overwriteExistingFiles === false && files.length > 0) {
    throw new Error(
      `Output directory ${outputPath} is not empty. Please specify an empty directory.`,
    )
  }

  // Delete all files in outputPath if `overwriteExistingFiles` is true
  if (config.overwriteExistingFiles === true) {
    await rm(join(outputPath, '*'), { recursive: true, force: true })
  }
}

/*
 * Copy needed CSS and JS to export path.
 */
export async function copyStaticAssets(config: Config, outputPath: string) {
  const viewsFolderPath = getPathToViewsFolder(config)

  const foldersToCopy = ['css', 'js', 'img']

  for (const folder of foldersToCopy) {
    if (
      await access(join(viewsFolderPath, folder))
        .then(() => true)
        .catch(() => false)
    ) {
      await cp(join(viewsFolderPath, folder), join(outputPath, folder), {
        recursive: true,
      })
    }
  }
}

/*
 * Render the HTML based on the config.
 */
export async function renderFile(
  templateFileName: string,
  templateVars: any,
  config: Config,
) {
  const templatePath = getPathToTemplateFile(templateFileName, config)
  const html = await pug.renderFile(templatePath, templateVars)

  // Beautify HTML if setting is set
  if (config.beautify === true) {
    return beautify.html_beautify(html, { indent_size: 2 })
  }

  return html
}
