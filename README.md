
# Transit Arrivals Widget

[![NPM version](https://img.shields.io/npm/v/transit-arrivals-widget.svg?style=flat)](https://www.npmjs.com/package/transit-arrivals-widget)
[![David](https://img.shields.io/david/blinktaginc/transit-arrivals-widget.svg)]()
[![npm](https://img.shields.io/npm/dm/transit-arrivals-widget.svg?style=flat)]()
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)

[![NPM](https://nodei.co/npm/transit-arrivals-widget.png?downloads=true)](https://nodei.co/npm/transit-arrivals-widget/)

Transit Arrivals Widget generates a user-friendly transit realtime arrival widget in HTML format directly from [GTFS and GTFS-RT transit data](http://gtfs.org/). Most transit agencies have schedule data in GTFS format and many publish realtime arrivals using GTFS-RT. This project generates HTML, JS and CSS for use on a transit agency website to allow users to see when the next vehicle is arriving at a specific stop.

Users can lookup arrivals by choosing a route, direction and stop or by entering stop id directly.  If a stop id is entered, arrivals for all routes serving that stop are shown.

Features:

* Auto-refreshes arrivals every 20 seconds. (configurable with the `refreshIntervalSeconds` parameter)

* Caches arrivals so looking up additional stops is instantaneous.

* Typeahead autocomplete of stop names makes it easy to look up stops by name.

* Appends stop_id to URL to support linking to arrivals for a specific stop or bookmarking the page.

* Uses `route_color` and `route_text_color` for a stop circle in results.

* Fetches GTFS-RT data directly - no server-side code is needed.

* Supports creation of custom HTML templates for complete control over how the widget is rendered.

## Demo

An demo of the widget is available at https://transit-arrivals-widget.blinktag.com/. Note that this demo will only return arrivals during hours where vehicles for the demo agency is operating, roughly 7 AM to 10 PM Pacific time.

## Current Usage
The following transit agencies use `transit-arrivals-widget` as the arrivals tool on their websites:

* [Marin Transit](https://marintransit.org/)

## Command Line Usage

The `transit-arrivals-widget` command-line utility will download the GTFS file specified in `config.js` and then build the transit arrivals widget and save the  HTML, CSS and JS in `html/:agency_key`.

If you would like to use this library as a command-line utility, you can install it globally directly from [npm](https://npmjs.org):

    npm install transit-arrivals-widget -g

Then you can run `transit-arrivals-widget`.

    transit-arrivals-widget

### Command-line options

`configPath`

Allows specifying a path to a configuration json file. By default, `transit-arrivals-widget` will look for a `config.json` file in the directory it is being run from.

    transit-arrivals-widget --configPath /path/to/your/custom-config.json

`skipImport`

Skips importing GTFS into SQLite. Useful if you are rerunning with an unchanged GTFS file. If you use this option and the GTFS file hasn't been imported, you'll get an error.

    transit-arrivals-widget --skipImport


## Configuration

Copy `config-sample.json` to `config.json` and then add your projects configuration to `config.json`.

    cp config-sample.json config.json

| option | type | description |
| ------ | ---- | ----------- |
| [`agency`](#agency) | object | Information about the GTFS and GTFS-RT to be used. |
| [`beautify`](#beautify) | boolean | Whether or not to beautify the HTML output. |
| [`noHead`](#nohead) | boolean | Whether or not to skip the header and footer of the HTML document. |
| [`refreshIntervalSeconds`](#refreshIntervalSeconds) | integer | How often the widget should refresh arrival data in seconds. Optional, defaults to 20 seconds. |
| [`skipImport`](#skipimport) | boolean | Whether or not to skip importing GTFS data into SQLite. |
| [`sqlitePath`](#sqlitepath) | string | A path to an SQLite database. Optional, defaults to using an in-memory database. |
| [`templatePath`](#templatepath) | string | Path to custom pug template for rendering widget. |

### agency

{Object} Specify the GTFS file to be imported in an `agency` object. Static GTFS files can be imported via a `url` or a local `path`.

`agency_key` is a short name you create that is specific to that GTFS file.

`gtfs_static_url` is the URL of an agency's static GTFS. Either `gtfs_static_url` or `gtfs_static_path` is required.

`gtfs_static_path` is the local path to an agency's static GTFS on your local machine. Either `gtfs_static_url` or `gtfs_static_path` is required.

`gtfs_rt_tripupdates_url` is the URL of an agency's GTFS-RT trip updates. Note that the GTFS-RT URL must support [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) in order for the widget to work.

* Specify a download URL for static GTFS:
```
{
  "agency": {
    "agency_key": "marintransit",
    "gtfs_static_url": "https://marintransit.org/data/google_transit.zip",
    "gtfs_rt_tripupdates_url": "https://marintransit.net/gtfs-rt/tripupdates"
  }
}
```

* Specify a path to a zipped GTFS file:
```
{
  "agency": {
    "agency_key": "marintransit",
    "gtfs_static_path": "/path/to/the/gtfs.zip",
    "gtfs_rt_tripupdates_url": "https://marintransit.net/gtfs-rt/tripupdates"
  }
}
```
* Specify a path to an unzipped GTFS file:
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

### noHead

{Boolean} Whether or not to skip the HTML head and footer when generating the HTML for the widget. This is useful for creating embeddable HTML without `<html>`, `<head>` or `<body>` tags. Defaults to `false`.

```
    "noHead": false
```

### refreshIntervalSeconds

{Integer} How often the widget should refresh arrival data in seconds. Optional, defaults to 20 seconds.

```
    "refreshIntervalSeconds": 30
```

### skipImport

{Boolean} Whether or not to skip importing from GTFS into SQLite. Useful for re-running the script if the GTFS data has not changed. If you use this option and the GTFS file hasn't been imported or you don't have an `sqlitePath` to a non-in-memory database specified, you'll get an error. Defaults to `false`.

```
    "skipImport": false
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

## Previewing HTML output

It can be useful to run the example Express application included in the `app` folder as a way to quickly preview all routes or see changes you are making to custom template.

After an initial run of `transit-arrivals-widget`, the GTFS data will be downloaded and loaded into SQLite.

You can view an individual route HTML on demand by running the included Express app:

    node app

By default, `transit-arrivals-widget` will look for a `config.json` file in the project root. To specify a different path for the configuration file:

    node app --configPath /path/to/your/custom-config.json

Once running, you can view the HTML in your browser at [localhost:3000](http://localhost:3000)

## Notes

`transit-arrivals-widget` uses the [`node-gtfs`](https://github.com/blinktaginc/node-gtfs) library to handle importing and querying GTFS data.

## Contributing

Pull requests are welcome, as is feedback and [reporting issues](https://github.com/blinktaginc/transit-arrivals-widget/issues).
