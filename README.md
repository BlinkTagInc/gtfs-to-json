# GTFS-to-JSON

Export GTFS Schedule routes and stops as JSON. Import local ZIP files, directories, or download URLs, or export data already stored in a node-GTFS v5 database.

Uses the same `sources`, `database`, `extensions`, and `reporting` configuration as [node-GTFS v5](https://github.com/BlinkTagInc/node-gtfs), with JSON-specific options under `export`. Requires Node.js 22.18+ (22.x), 24, 26, or a newer compatible version. ESM only.

## Quick start

```sh
npm install -g gtfs-to-json
gtfs-to-json --input ./gtfs.zip --output ./json
```

Or save a configuration as `config.json` and run `gtfs-to-json`:

```json
{
  "sources": [
    {
      "sourceId": "county-bus",
      "schedule": { "url": "https://county.gov/gtfs.zip" }
    }
  ],
  "export": { "outputDirectory": "./json" }
}
```

See [config-sample.json](config-sample.json) and [config-sample-full.json](config-sample-full.json). Relative paths resolve from the working directory.

## CLI

```sh
gtfs-to-json --config ./config.json
gtfs-to-json --url https://county.gov/gtfs.zip --source-id county-bus
gtfs-to-json --database ./transit.sqlite --source-id county-bus --output ./json
gtfs-to-json --config ./config.json --agency-id A --overwrite
```

| Flag                             | Purpose                                                       |
| -------------------------------- | ------------------------------------------------------------- |
| `-c, --config <file>`            | Configuration file; defaults to `./config.json` if present    |
| `--input <path>`                 | Local GTFS ZIP or directory                                   |
| `--url <url>`                    | GTFS download URL; cannot be combined with `--input`          |
| `--database <path>`              | SQLite database                                               |
| `--source-id <id>`               | Source for direct input or source selection                   |
| `--output <path>`                | Output directory                                              |
| `--agency-id <id>`               | Filter by the feed's GTFS `agency_id`                         |
| `--stop-merge-distance <meters>` | Nearby stop merging distance; `0` disables name-based merging |
| `--overwrite`                    | Replace a previous JSON export                                |
| `-l, --log-level <level>`        | `silent`, `error`, `warn`, or `info`                          |
| `-h, --help`                     | Show help                                                     |
| `-v, --version`                  | Print version                                                 |

CLI flags override the corresponding configuration options. Direct `--input` or `--url` replaces configured sources and uses source ID `default` unless `--source-id` is supplied. Sources with `schedule` are imported; omit `schedule` to reuse an existing database. An optional `export` command is accepted: `gtfs-to-json export --input ./gtfs.zip`.

## JavaScript

```js
import { exportJSON } from 'gtfs-to-json';

const result = await exportJSON({
  sources: [{ sourceId: 'bus', schedule: { path: './gtfs.zip' } }],
  export: { outputDirectory: './json', overwrite: true },
});

console.log(result.outputDirectory, result.files);
```

The function returns the absolute output directory and relative JSON file paths. TypeScript exports include `JSONConfig` and `JSONExportOptions`. Library reporting follows node-GTFS; supply `reporting.reporter` to receive events, or use its `createConsoleReporter()` for CLI-style output. The CLI installs that reporter automatically.

## Configuration

The database defaults to in-memory SQLite. Set `database.path` to keep imported data between runs, or supply a node-GTFS `database.client`. Multiple sources require distinct `sourceId` values. Only a selected `export.sourceId` is imported/exported when that filter is set.

Configure download headers and timeouts with `sources[].schedule.requestHeaders` and `timeoutMs`. Import options go under `sources[].schedule.import`; for example, `validation.onDuplicateKey: "keep-first"` keeps the first row when a feed repeats a primary key. Shared settings are validated by node-GTFS; unknown JSON export options are rejected.

| `export` option           | Default                | Purpose                                                                          |
| ------------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| `outputDirectory`         | `"./json"`             | Dedicated destination directory                                                  |
| `overwrite`               | `false`                | Replace a previous manifest-backed JSON export                                   |
| `sourceId`                | All configured sources | Export one source                                                                |
| `agencyId`                | All agencies           | Filter routes by their GTFS agency ID (string)                                   |
| `stopMergeDistanceMeters` | `304.8`                | Merge identical stop names within this distance; `0` keeps all distinct stop IDs |

To export without importing:

```json
{
  "database": { "path": "./transit.sqlite" },
  "sources": [{ "sourceId": "county-bus" }],
  "export": { "outputDirectory": "./json", "overwrite": true }
}
```

## Output

Each source produces `<sourceId>/<sourceId>.json` (for example, `eurekatransit/eurekatransit.json`), containing an array:

```json
[
  {
    "source_id": "county-bus",
    "route_id": "r2",
    "agency_id": "A",
    "route_short_name": "2",
    "route_long_name": "Downtown",
    "route_type": 3,
    "route_full_name": "2 - Downtown",
    "stops": [
      {
        "stop_id": "central",
        "stop_name": "Central Station",
        "stop_lat": 37.1,
        "stop_lon": -122.1
      }
    ]
  }
]
```

- Every route is retained, including routes sharing short names and routes without trips. Routes sort by numeric short-name prefix, then short name, long name, and ID.
- Stops include all trips for the route, across service dates and directions. They sort by name and ID, not travel order.
- Child stops use their parent station's identity and available fields. A missing parent falls back to the child stop.
- Each stop ID appears once per route. Stops with identical nonempty names within the configured distance of an already retained stop are merged. Missing coordinates prevent proximity merging; zero coordinates are valid.
- GTFS `agency_id` is preserved, including `null` when absent. `source_id` identifies the feed. Unsafe or case-colliding source IDs receive filesystem-safe names; JSON IDs stay unchanged.

The root `json-manifest.json` records generated files. Output is staged before replacement, so failed generation preserves the previous export. Nonempty directories require a valid manifest and `overwrite: true`; unrelated files and symlinks are rejected. Database imports are separate from output replacement and are not rolled back if a later export fails.

## Migrating from 0.x

This release intentionally removes the old API and configuration aliases.

| Before                                              | Now                                                        |
| --------------------------------------------------- | ---------------------------------------------------------- |
| Default `gtfsToJson(config)` import                 | Named `exportJSON(config)` import                          |
| `agencies[]`                                        | `sources[]`                                                |
| `agencyKey`                                         | `sourceId` (feed identity)                                 |
| Agency `path`, `url`, `headers`                     | `schedule.path`, `schedule.url`, `schedule.requestHeaders` |
| Agency `agencyId`                                   | `export.agencyId` (string)                                 |
| `sqlitePath`, `db`                                  | `database.path`, `database.client`                         |
| `skipImport`                                        | Omit `schedule` for database-only sources                  |
| `ignoreDuplicates`                                  | `schedule.import.validation.onDuplicateKey: "keep-first"`  |
| `downloadTimeout`                                   | `schedule.timeoutMs`                                       |
| `logLevel`, `logFunction`                           | `reporting.level`, `reporting.reporter`                    |
| `warning` log level                                 | `warn`                                                     |
| `--configPath`, `--skipImport`                      | `--config`; database-only sources                          |
| `output/<agencyKey>/<agencyKey>.json` and `log.txt` | `json/<sourceId>/<sourceId>.json` and root manifest        |

`agency_id` now contains the actual GTFS value instead of the old agency key; use `source_id` for feed identity. Routes with duplicate short names are no longer discarded. One source can contain multiple agencies; filter with `export.agencyId` or run separate exports into separate directories for agency-specific datasets. Old output directories have no manifest: choose a new directory for your first export. Reimport v4 databases into a fresh v5 database.

Licensed under [MIT](LICENSE.txt).
