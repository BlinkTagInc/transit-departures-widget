<p align="center">
  ➡️
  <a href="#command-line-usage">Command Line Usage</a> |
  <a href="#configuration">Configuration</a>
  ⬅️
  <br /><br />
  <img src="docs/images/transit-departures-widget-logo.svg" alt="Transit Departures Widget" />
  <br /><br />
  <a href="https://www.npmjs.com/package/transit-departures-widget" rel="nofollow"><img src="https://img.shields.io/npm/v/transit-departures-widget.svg?style=flat" style="max-width: 100%;"></a>
  <a href="https://www.npmjs.com/package/transit-departures-widget" rel="nofollow"><img src="https://img.shields.io/npm/dm/transit-departures-widget.svg?style=flat" style="max-width: 100%;"></a>
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg">
  <br /><br />
  Build a realtime transit departures lookup widget from GTFS and GTFS-Realtime.
  <br /><br />
  <a href="https://nodei.co/npm/transit-departures-widget/" rel="nofollow"><img src="https://nodei.co/npm/transit-departures-widget.png?downloads=true" alt="NPM" style="max-width: 100%;"></a>
</p>

<hr>

Transit Departures Widget generates a user-friendly transit realtime departures widget in HTML format directly from [GTFS and GTFS-RT transit data](http://gtfs.org/). Most transit agencies have schedule data in GTFS format and many publish realtime departures using GTFS-Realtime. This project generates HTML, JS and CSS for use on a transit agency website to allow users to see when the next vehicle is departing from a specific stop.

<img width="593" alt="transit-departures-widget1" src="https://user-images.githubusercontent.com/96217/115478598-5fbcbd00-a1fb-11eb-833c-4005bfa442d8.png">
<p>Lookup by route, direction and stop</p>

<img width="618" alt="transit-departures-widget2" src="https://user-images.githubusercontent.com/96217/115478607-63504400-a1fb-11eb-9ca6-548d1f27230f.png">
<p>Lookup by stop name</p>

<img width="597" alt="transit-departures-widget3" src="https://user-images.githubusercontent.com/96217/115478620-677c6180-a1fb-11eb-9349-431cc82cfe3f.png">
<p>Lookup by stop code</p>

Users can lookup departures by choosing a route, direction and stop or by entering stop id directly. If a stop code is entered, departures for all routes serving that stop are shown.

Features:

- Auto-refreshes departures every 20 seconds. (configurable with the `refreshIntervalSeconds` parameter)

- Caches departures so looking up additional stops is instantaneous.

- Typeahead autocomplete of stop names makes it easy to look up stops by name.

- Appends stop_id to URL to support linking to departures for a specific stop or bookmarking the page.

- Uses `route_color` and `route_text_color` for a stop circle in results.

- Fetches GTFS-RT data directly - no server-side code is needed.

- Supports creation of custom HTML templates for complete control over how the widget is rendered.

## Demo

An demo of the widget is available at https://transit-departures-widget.blinktag.com/. Note that this demo will only return departures during hours where vehicles for the demo agency is operating, roughly 7 AM to 10 PM Pacific time.

## Current Usage

The following transit agencies use `transit-departures-widget` on their websites:

- [County Connection](https://countyconnection.com)
- [Kings Area Regional Transit](https://kartbus.org)
- [Marin Transit](https://marintransit.org/)
- [Mountain View Community Shuttle](https://mvcommunityshuttle.com)
- [MVgo](https://mvgo.org/)

## Command Line Usage

The `transit-departures-widget` command-line utility will download the GTFS file specified in `config.js` and then build the transit departures widget and save the HTML, CSS and JS in `html/:agency_key`.

If you would like to use this library as a command-line utility, you can install it globally directly from [npm](https://npmjs.org):

    npm install transit-departures-widget -g

Then you can run `transit-departures-widget`.

    transit-departures-widget

### Command-line options

`configPath`

Allows specifying a path to a configuration json file. By default, `transit-departures-widget` will look for a `config.json` file in the directory it is being run from.

    transit-departures-widget --configPath /path/to/your/custom-config.json

`skipImport`

Skips importing GTFS into SQLite. Useful if you are rerunning with an unchanged GTFS file. If you use this option and the GTFS file hasn't been imported, you'll get an error.

    transit-departures-widget --skipImport

## Configuration

Copy `config-sample.json` to `config.json` and then add your projects configuration to `config.json`.

    cp config-sample.json config.json

| option                                              | type    | description                                                                                                                 |
| --------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| [`agency`](#agency)                                 | object  | Information about the GTFS and GTFS-RT to be used.                                                                          |
| [`beautify`](#beautify)                             | boolean | Whether or not to beautify the HTML output.                                                                                 |
| [`endDate`](#enddate)                               | string  | A date in YYYYMMDD format to use to filter calendar.txt service. Optional, defaults to using all service in specified GTFS. |
| [`includeCoordinates`](#includecoordinates)         | boolean  | Whether or not to include stop coordinates in JSON output. |
| [`locale`](#locale)                                 | string  | The 2-letter code of the language to use for the interface.                                                                 |
| [`noHead`](#nohead)                                 | boolean | Whether or not to skip the header and footer of the HTML document.                                                          |
| [`refreshIntervalSeconds`](#refreshIntervalSeconds) | integer | How often the widget should refresh departure data in seconds. Optional, defaults to 20 seconds.                            |
| [`skipImport`](#skipimport)                         | boolean | Whether or not to skip importing GTFS data into SQLite.                                                                     |
| [`sqlitePath`](#sqlitepath)                         | string  | A path to an SQLite database. Optional, defaults to using an in-memory database.                                            |
| [`startDate`](#startdate)                           | string  | A date in YYYYMMDD format to use to filter calendar.txt service. Optional, defaults to using all service in specified GTFS. |
| [`templatePath`](#templatepath)                     | string  | Path to custom pug template for rendering widget.                                                                           |
| [`timeFormat`](#timeFormat)                         | string  | The format (12hour or 24hour) for the "as of" display.                                                                      |

### agency

{Object} Specify the GTFS file to be imported in an `agency` object. Static GTFS files can be imported via a `url` or a local `path`.

`agency_key` is a short name you create that is specific to that GTFS file.

`gtfs_static_url` is the URL of an agency's static GTFS. Either `gtfs_static_url` or `gtfs_static_path` is required.

`gtfs_static_path` is the local path to an agency's static GTFS on your local machine. Either `gtfs_static_url` or `gtfs_static_path` is required.

`gtfs_rt_tripupdates_url` is the URL of an agency's GTFS-RT trip updates. Note that the GTFS-RT URL must support [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) in order for the widget to work. You may need to set up a proxy that adds CORS headers to your GTFS-RT URLS. [GTFS Realtime Proxy](https://github.com/BlinkTagInc/gtfs-realtime-proxy) is an open-source tool that you could use for adding CORS headers.

- Specify a download URL for static GTFS:

```
{
  "agency": {
    "agency_key": "marintransit",
    "gtfs_static_url": "https://marintransit.org/data/google_transit.zip",
    "gtfs_rt_tripupdates_url": "https://marintransit.net/gtfs-rt/tripupdates"
  }
}
```

- Specify a path to a zipped GTFS file:

```
{
  "agency": {
    "agency_key": "marintransit",
    "gtfs_static_path": "/path/to/the/gtfs.zip",
    "gtfs_rt_tripupdates_url": "https://marintransit.net/gtfs-rt/tripupdates"
  }
}
```

- Specify a path to an unzipped GTFS file:

```
{
  "agency": {
    "agency_key": "marintransit",
    "gtfs_static_path": "/path/to/the/unzipped/gtfs",
    "gtfs_rt_tripupdates_url": "https://marintransit.net/gtfs-rt/tripupdates"
  }
}
```

### beautify

{Boolean} Whether or not to beautify the HTML output. Defaults to `false`.

```
    "beautify": false
```

### endDate

{String} A date in YYYYMMDD format to use to filter service_ids in calendar.txt. Useful in combination with `startDate` configuration option. Optional, if not specified, all services in GTFS will be used.

```
    "endDate": "20240401"
```

### includeCoordinates

{Boolean} Whether or not to include stop coordinates in the stops.json output. Can be useful if you need to customize the output to show stops on a map or filter by location. Defaults to `false`.

```
    "includeCoordinates": false
```

### locale

{String} The 2-letter language code of the language to use for the interface. Current languages supported are Polish (`pl`) and English (`en`). Pull Requests welcome for translations to other languages. Defaults to `en` (English).

```
    "locale": "en"
```

### noHead

{Boolean} Whether or not to skip the HTML head and footer when generating the HTML for the widget. This is useful for creating embeddable HTML without `<html>`, `<head>` or `<body>` tags. Defaults to `false`.

```
    "noHead": false
```

### refreshIntervalSeconds

{Integer} How often the widget should refresh departure data in seconds. Optional, defaults to 20 seconds.

```
    "refreshIntervalSeconds": 30
```

### skipImport

{Boolean} Whether or not to skip importing from GTFS into SQLite. Useful for re-running the script if the GTFS data has not changed. If you use this option and the GTFS file hasn't been imported or you don't have an `sqlitePath` to a non-in-memory database specified, you'll get an error. Defaults to `false`.

```
    "skipImport": false
```

### startDate

{String} A date in YYYYMMDD format to use to filter service_ids in calendar.txt. Useful in combination with `endDate` configuration option. Optional, if not specified, all services in GTFS will be used.

```
    "startDate": "20240301"
```

### sqlitePath

{String} A path to an SQLite database. Optional, defaults to using an in-memory database.

```
    "sqlitePath": "/tmp/gtfs"
```

### templatePath

{String} Path to a folder containing (pug)[https://pugjs.org/] template for rendering the widget widget. This is optional. Defaults to using the templates provided in `views/widget`. All files within the `/views/custom` folder will be .gitignored, so you can copy the `views/widget` folder to `views/custom/myagency` and make any modifications needed. Any custom views folder should contain pug templates called `widget.pug` and `widget_full.pug`.

```
    "templatePath": "views/custom/my-agency/"
```

### timeFormat

{String} The format (`12hour` or `24hour`) for the "as of" display. Defaults to `12hour`.

```
    "timeFormat": "12hour"
```

## Previewing HTML output

It can be useful to run the example Express application included in the `app` folder as a way to quickly preview all routes or see changes you are making to custom template.

After an initial run of `transit-departures-widget`, the GTFS data will be downloaded and loaded into SQLite.

You can view an individual route HTML on demand by running the included Express app:

    npm start

By default, `transit-departures-widget` will look for a `config.json` file in the project root. To specify a different path for the configuration file:

    npm start -- --configPath /path/to/your/custom-config.json

Once running, you can view the HTML in your browser at [localhost:3000](http://localhost:3000)

## Notes

`transit-departures-widget` uses the [`node-gtfs`](https://github.com/blinktaginc/node-gtfs) library to handle importing and querying GTFS data.

## Contributing

Pull requests are welcome, as is feedback and [reporting issues](https://github.com/blinktaginc/transit-departures-widget/issues).
