import { join } from 'path'
import { I18n } from 'i18n'

import { Config } from '../../types/global_interfaces.ts'
import { getPathToViewsFolder } from '../file-utils.ts'

/*
 * Initialize configuration with defaults.
 */
export function setDefaultConfig(initialConfig: Config) {
  const defaults = {
    beautify: false,
    noHead: false,
    refreshIntervalSeconds: 20,
    skipImport: false,
    timeFormat: '12hour',
    includeCoordinates: false,
    overwriteExistingFiles: true,
    verbose: true,
  }

  const config = Object.assign(defaults, initialConfig)
  const viewsFolderPath = getPathToViewsFolder(config)
  const i18n = new I18n({
    directory: join(viewsFolderPath, 'locales'),
    defaultLocale: config.locale,
    updateFiles: false,
  })
  const configWithI18n = Object.assign(config, {
    __: i18n.__,
  })
  return configWithI18n
}
