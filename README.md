# GTFS-to-JSON

Generate JSON of transit route data from a GTFS file

## Installation

```
npm install gtfs-to-json -g
```

## Usage

`gtfs-to-json` runs from the command line. By default it looks for a `config.json` file in the directory it is run from.

```
gtfs-to-json
```

You can also specify a path to a config file:

```
gtfs-to-json --config /path/to/your/custom-config.json
```

To skip re-downloading and re-importing the GTFS and just regenerate JSON from data already imported into SQLite:

```
gtfs-to-json --skipImport
```

For each agency, a folder is created under `output/<agencyKey>` containing a `<agencyKey>.json` file with route and stop data, plus a `log.txt` describing the import.

## Configuration

`gtfs-to-json` uses a `config.json` file to define one or more GTFS agencies to import and export as JSON. Each entry in the `agencies` array can specify either a `url` to download the GTFS from or a local `path` to a GTFS file or folder.

```json
{
  "agencies": [
    {
      "agencyKey": "county-bus",
      "url": "https://county.gov/gtfs.zip"
    }
  ]
}
```

### Config options

| option             | type    | description                                                                                           |
| ------------------ | ------- | ----------------------------------------------------------------------------------------------------- |
| `agencies`         | array   | Required. An array of agencies to import, each with the options below.                                |
| `logLevel`         | string  | `silent`, `error`, `warning`, or `info`                                                               |
| `sqlitePath`       | string  | Full path to the SQLite database used to store imported GTFS data. Defaults to an in-memory database. |
| `skipImport`       | boolean | If true, don't download or import GTFS data — just regenerate JSON from the existing SQLite database. |
| `ignoreDuplicates` | boolean | If true, ignore duplicate entries encountered while importing GTFS data instead of throwing an error. |

### Agency options

| option      | type             | description                                                                                                                                                                                      |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agencyKey` | string           | Required. A short name used to identify the agency and name its output folder/file.                                                                                                              |
| `url`       | string           | URL to download the agency's GTFS zip file from. Either `url` or `path` is required.                                                                                                             |
| `path`      | string           | Path to a local GTFS zip file or folder. Either `url` or `path` is required.                                                                                                                     |
| `agencyId`  | string \| number | Optional. If a GTFS feed contains data for multiple agencies (as identified by `agency_id` in `agency.txt`), set this to only include routes and stops served by that agency in the output JSON. |

This is useful for shared regional GTFS feeds that bundle several agencies together. For example, the following two config entries both pull from the same feed but each only outputs the routes/stops for their respective agency:

```json
{
  "agencies": [
    {
      "agencyKey": "kanan",
      "url": "https://govcbus.com/gtfs",
      "agencyId": 144
    },
    {
      "agencyKey": "gctd",
      "url": "https://govcbus.com/gtfs",
      "agencyId": 139
    }
  ]
}
```
