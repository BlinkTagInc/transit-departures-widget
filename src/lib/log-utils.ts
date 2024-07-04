import readline from 'readline'
import { noop } from 'lodash-es'
import * as colors from 'yoctocolors'

import { IConfig } from '../types/global_interfaces.ts'

/*
 * Returns a log function based on config settings
 */
export function log(config: IConfig) {
  if (config.verbose === false) {
    return noop
  }

  if (config.logFunction) {
    return config.logFunction
  }

  return (text: string, overwrite: boolean) => {
    if (overwrite === true) {
      readline.clearLine(process.stdout, 0)
      readline.cursorTo(process.stdout, 0)
    } else {
      process.stdout.write('\n')
    }

    process.stdout.write(text)
  }
}

/*
 * Returns an warning log function based on config settings
 */
export function logWarning(config: IConfig) {
  if (config.logFunction) {
    return config.logFunction
  }

  return (text: string) => {
    process.stdout.write(`\n${formatWarning(text)}\n`)
  }
}

/*
 * Returns an error log function based on config settings
 */
export function logError(config: IConfig) {
  if (config.logFunction) {
    return config.logFunction
  }

  return (text: string) => {
    process.stdout.write(`\n${formatError(text)}\n`)
  }
}

/*
 * Format console warning text
 */
export function formatWarning(text: string) {
  const warningMessage = `${colors.underline('Warning')}: ${text}`
  return colors.yellow(warningMessage)
}

/*
 * Format console error text
 */
export function formatError(error: any) {
  const messageText = error instanceof Error ? error.message : error
  const errorMessage = `${colors.underline('Error')}: ${messageText.replace(
    'Error: ',
    '',
  )}`
  return colors.red(errorMessage)
}
