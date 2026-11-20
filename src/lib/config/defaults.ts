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
  if (!config.agency) {
    throw new Error('No agency defined in `config.json`')
  }
  const url = config.agency.gtfs_rt_tripupdates_url
  if (
    typeof url !== 'string' ||
    !URL.canParse(url) ||
    !['http:', 'https:'].includes(new URL(url).protocol)
  ) {
    throw new Error(
      'agency.gtfs_rt_tripupdates_url must be an absolute HTTP or HTTPS URL',
    )
  }
  // Browser timers use a signed 32-bit millisecond delay.
  if (
    !Number.isInteger(config.refreshIntervalSeconds) ||
    config.refreshIntervalSeconds < 1 ||
    config.refreshIntervalSeconds > 2147483
  ) {
    throw new Error(
      'refreshIntervalSeconds must be an integer between 1 and 2147483',
    )
  }
  if (config.timeFormat !== '12hour' && config.timeFormat !== '24hour') {
    throw new Error('timeFormat must be 12hour or 24hour')
  }
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
