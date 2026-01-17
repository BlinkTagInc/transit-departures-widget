import { clearLine, cursorTo } from 'node:readline'
import { noop } from 'lodash-es'
import * as colors from 'yoctocolors'

import { Config } from '../../types/global_interfaces.ts'

export type Logger = {
  info: (text: string, overwrite?: boolean) => void
  warn: (text: string) => void
  error: (text: string) => void
}

const formatWarning = (text: string) => {
  const warningMessage = `${colors.underline('Warning')}: ${text}`
  return colors.yellow(warningMessage)
}

export const formatError = (error: any) => {
  const messageText = error instanceof Error ? error.message : error
  const errorMessage = `${colors.underline('Error')}: ${messageText.replace(
    'Error: ',
    '',
  )}`
  return colors.red(errorMessage)
}

const logInfo = (config: Config) => {
  if (config.verbose === false) {
    return noop
  }

  if (config.logFunction) {
    return config.logFunction
  }

  return (text: string, overwrite?: boolean) => {
    if (overwrite === true && process.stdout.isTTY) {
      clearLine(process.stdout, 0)
      cursorTo(process.stdout, 0)
    } else {
      process.stdout.write('\n')
    }

    process.stdout.write(text)
  }
}

const logWarn = (config: Config) => {
  if (config.logFunction) {
    return config.logFunction
  }

  return (text: string) => {
    process.stdout.write(`\n${formatWarning(text)}\n`)
  }
}

const logError = (config: Config) => {
  if (config.logFunction) {
    return config.logFunction
  }

  return (text: string) => {
    process.stdout.write(`\n${formatError(text)}\n`)
  }
}

/*
 * Create a structured logger with consistent methods.
 */
export function createLogger(config: Config): Logger {
  return {
    info: logInfo(config),
    warn: logWarn(config),
    error: logError(config),
  }
}
