# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## Fixed

- Better removing of last stoptime of trip

## [2.2.1] - 2024-04-08

## Fixed

- allow query param in config gtfsRtTripupdatesUrl

## Updated

 - Dependency updates

## [2.2.0] - 2024-03-07

## Added

- startDate and endDate config params

## Updated

 - Dependency updates

## [2.1.1] - 2023-12-04

## Fixed

- Fix for routes with no directions

## Updated

 - Dependency updates

## [2.1.0] - 2023-09-13

## Changed

- Remove last stop of each route
- Improved autocomplete sorting
- Use stop_code as value in autocomplete
- Populate route dropdown on page load

## Fixed

- Fix for grouping child stops
- Handle case with no departures

## Updated

 - Dependency updates

## [2.0.0] - 2023-09-14

## Changed

- Renamed to transit-departures-widget
- Renamed all styles and functions to use departures instead of arrivals

## Fixed

- Handle empty direction_id in GTFS
- Hide overflow in route circle
- Better route sorting
- Fix for hidden arrival times after none available

## Updated

- Reword input to "stop" and "Stop code"
- Add support for GTFS without stop codes
- Hide departures more than 1 minute in the past

## [1.2.1] - 2023-08-14

## Fixed

- Error in logging functions

## Updated

- Use lint-staged instead of pretty-quick
- Dependency updates

## [1.2.0] - 2023-05-22

## Fixed

- Deduplicate stops in a row

## Updated

- Update to node-gtfs v4
- Dependency updates

## [1.1.0] - 2022-06-29

## Added

- Added a refresh button
- Updated filter to hide departure times at last stop of each trip

## Updated

- Dependency updates

## [1.0.2] - 2022-03-17

## Changed

- Move text out of JS into template
- Add i18n and support for locale translation file

## Fixed

- Fix issue with initial arrivals load
- Fix for routes with no colors defined
- Fix HTML escape for headsign in dropdown

## Updated

- Dependency updates

## [1.0.1] - 2021-10-17

## Updated

- node-gtfs library

## Added

- Husky and Prettier

## [1.0.0] - 2021-10-15

### Breaking Changes

- Converted to ES6 Module

### Added

- Support for other languages using languageCode config variable
- Polish translations
- Support for 24-hour time using timeFormat config variable

### Updated

- Dependency updates
- Support for release-it

## [0.1.4] - 2021-04-20

### Updated

- Dependency updates
- Readme updates

## [0.1.3] - 2021-01-12

### Fixed

- Fallback for cyclic routes when finding stop order

### Updated

- Dependency updates

## [0.1.2] - 2020-11-13

### Updated

- default to lookup by stop id
- better direction names

## [0.1.1] - 2020-11-10

### Added

- beautify option
- templatePath option
- noHead option

## [0.1.0] - 2020-11-10

### Added

- Initial Release
