
# Transit Arrivals Widget

[![NPM version](https://img.shields.io/npm/v/transit-arrivals-widget.svg?style=flat)](https://www.npmjs.com/package/transit-arrivals-widget)
[![David](https://img.shields.io/david/blinktaginc/transit-arrivals-widget.svg)]()
[![npm](https://img.shields.io/npm/dm/transit-arrivals-widget.svg?style=flat)]()
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)

[![NPM](https://nodei.co/npm/transit-arrivals-widget.png?downloads=true)](https://nodei.co/npm/transit-arrivals-widget/)

Transit Arrivals Widget generates a user-friendly transit realtime arrival widget in HTML format directly from [GTFS and GTFS-RT transit data](http://gtfs.org/). Most transit agencies have schedule data in GTFS format and many publish realtime arrivals using GTFS-RT. This project generates HTML, JS and CSS for use on a transit agency website to allow users to see when the next vehicle is arriving at a specific stop.

Users can lookup arrivals by choosing a route, direction and stop or by entering stop id directly.  If a stop id is entered, arrivals for all routes serving that stop are shown.

An demo of the widget is available at https://transit-arrivals-widget.blinktag.com/. Note that this demo will only return arrivals during hours where vehicles for the demo agency is operating, roughly 7 AM to 10 PM Pacific time.

Arrival information is refreshed every 20 seconds by default, but can be set with the `refreshIntervalSeconds` config parameter.

## Configuration

Copy `config-sample.json` to `config.json` and then add your projects configuration to `config.json`.

    cp config-sample.json config.json

| option | type | description |
| ------ | ---- | ----------- |
| [`agency`](#agency) | array | Information about the GTFS and GTFS-RT to be used. |
| [`refreshIntervalSeconds`](#refreshIntervalSeconds) | integer | How often the widget should refresh arrival data in seconds. Optional, defaults to 20 seconds. |
| [`skipImport`](#skipImport) | boolean | Whether or not to skip importing GTFS data into SQLite. |
| [`sqlitePath`](#sqlitePath) | string | A path to an SQLite database. Optional, defaults to using an in-memory database. |

### agency

{Object} Specify the GTFS file to be imported in an `agency` object. Static GTFS files can be imported via a `url` or a local `path`.

`agency_key` is a short name you create that is specific to that GTFS file.

`gtfs_static_url` is the URL of an agency's static GTFS. Either `gtfs_static_url` or `gtfs_static_path` is required.

`gtfs_static_path` is the local path to an agency's static GTFS on your local machine. Either `gtfs_static_url` or `gtfs_static_path` is required.

`gtfs_rt_tripupdates_url` is the URL of an agency's GTFS-RT trip updates.

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

