import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { rm, mkdir } from 'node:fs/promises';
import { sortBy, uniqBy } from 'lodash-es';
import { Gtfs, createConsoleReporter } from 'gtfs';
import type { GtfsScheduleImportSourceConfig } from 'gtfs';
import Timer from 'timer-machine';
import { getExportPath, writeSanitizedFile } from './file-utils.ts';
import { getRouteName, msToSeconds } from './formatters.ts';
import { deduplicateStops } from './stop-utils.ts';
import { log, generateLogText, logStats } from './log-utils.ts';
import packageJson from '../../package.json' with { type: 'json' };
import type {
  AgencyConfig,
  IConfig,
  RuntimeConfig,
} from '../types/global_interfaces.ts';

const sourceIdFor = (agency: AgencyConfig) =>
  agency.sourceId ?? agency.agencyKey;

const buildAgencyJSON = async (
  gtfs: Gtfs,
  agency: AgencyConfig,
  outputStats: Record<string, number>,
) => {
  const agencyKey = agency.agencyKey;
  const sourceId = sourceIdFor(agency);
  let reader = gtfs.schedule.routes
    .where({ source_id: sourceId })
    .select('route_id', 'route_short_name', 'route_long_name', 'route_type')
    .orderBy([{ field: 'route_short_name', direction: 'asc' }]);
  if (agency.agencyId !== undefined) {
    reader = reader.where({ agency_id: String(agency.agencyId) });
  }
  const routes = await reader.all();
  const routesWithShortName = routes.filter((route) => route.route_short_name);
  const routesWithoutShortName = routes.filter(
    (route) => !route.route_short_name,
  );

  const routesJSON = sortBy(
    [
      ...uniqBy(routesWithShortName, 'route_short_name'),
      ...routesWithoutShortName,
    ],
    [
      (route) => {
        const parsed = parseInt(route.route_short_name ?? '', 10);
        return Number.isNaN(parsed) ? Infinity : parsed;
      },
      (route) => route.route_short_name ?? '',
      (route) => route.route_long_name ?? '',
    ],
  );

  const output = [];
  for (const route of routesJSON) {
    const stops = await gtfs.database.withKysely({
      callback: (db) =>
        db
          .selectFrom('stops')
          .innerJoin('stop_times', (join) =>
            join
              .onRef('stops.source_id', '=', 'stop_times.source_id')
              .onRef('stops.stop_id', '=', 'stop_times.stop_id'),
          )
          .innerJoin('trips', (join) =>
            join
              .onRef('trips.source_id', '=', 'stop_times.source_id')
              .onRef('trips.trip_id', '=', 'stop_times.trip_id'),
          )
          .innerJoin('stops as station', (join) =>
            join
              .onRef('station.source_id', '=', 'stops.source_id')
              .on('station.stop_id', '=', (eb) =>
                eb.fn.coalesce(
                  eb.fn<string>('nullif', [
                    eb.ref('stops.parent_station'),
                    eb.val(''),
                  ]),
                  eb.ref('stops.stop_id'),
                ),
              ),
          )
          .select([
            'station.stop_id',
            'station.stop_name',
            'station.stop_lat',
            'station.stop_lon',
          ])
          .where('trips.source_id', '=', sourceId)
          .where('trips.route_id', '=', route.route_id)
          .orderBy('station.stop_name')
          .orderBy('station.stop_id')
          .execute(),
    });
    const routeStops = deduplicateStops(stops);
    output.push({
      ...route,
      route_full_name: getRouteName(route),
      stops: routeStops,
      agency_id: agencyKey,
    });
    outputStats.stops += routeStops.length;
  }
  outputStats.routes += output.length;
  await writeSanitizedFile(
    getExportPath(agencyKey),
    `${agencyKey}.json`,
    JSON.stringify(output, null, 2),
  );
};

const gtfsToJson = async (initialConfig: IConfig): Promise<void> => {
  // Application settings never pass through to the node-GTFS constructor.
  for (const option of ['ignoreErrors', 'csvOptions', 'verbose']) {
    if (option in initialConfig) {
      throw new Error(
        `Unsupported legacy option: ${option}. See README migration notes.`,
      );
    }
  }
  if (initialConfig.db && initialConfig.sqlitePath) {
    throw new Error('Specify db or sqlitePath, not both.');
  }
  if (
    initialConfig.skipImport &&
    !initialConfig.db &&
    (!initialConfig.sqlitePath || initialConfig.sqlitePath === ':memory:')
  ) {
    throw new Error('skipImport requires an existing v5 sqlitePath or db.');
  }
  const sources = new Map<string, GtfsScheduleImportSourceConfig>();
  for (const agency of initialConfig.agencies) {
    for (const option of [
      'prefix',
      'exclude',
      'fillEmptyAgencyId',
      'realtimeAlerts',
      'realtimeTripUpdates',
      'realtimeVehiclePositions',
    ]) {
      if (option in agency) {
        throw new Error(
          `Unsupported legacy agency option: ${option}. See README migration notes.`,
        );
      }
    }
    const sourceId = sourceIdFor(agency);
    if (!sourceId.trim()) {
      throw new Error('Every agency needs a nonempty sourceId or agencyKey.');
    }
    if (initialConfig.skipImport) {
      continue;
    }
    if (Boolean(agency.path) === Boolean(agency.url)) {
      throw new Error(
        `Specify exactly one path or url for ${agency.agencyKey}.`,
      );
    }
    const source: GtfsScheduleImportSourceConfig = {
      sourceId,
      schedule: {
        ...(agency.path
          ? { path: agency.path }
          : {
              url: agency.url!,
              requestHeaders: agency.headers,
              timeoutMs: initialConfig.downloadTimeout,
            }),
        excludeFiles: [
          'areas.txt',
          'attributions.txt',
          'booking_rules.txt',
          'fare_attributes.txt',
          'fare_transfer_rules.txt',
          'fare_leg_rules.txt',
          'fare_products.txt',
          'fare_rules.txt',
          'levels.txt',
          'location_group_stops.txt',
          'location_groups.txt',
          'locations.geojson',
          'pathways.txt',
          'rider_categories.txt',
          'route_networks.txt',
          'shapes.txt',
          'translations.txt',
          'timeframes.txt',
          'transfers.txt',
        ],
        import: {
          validation: {
            onDuplicateKey: initialConfig.ignoreDuplicates
              ? 'keep-first'
              : 'reject',
          },
        },
      },
    };
    const previous = sources.get(sourceId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(source)) {
      throw new Error(`Conflicting feeds for sourceId ${sourceId}.`);
    }
    sources.set(sourceId, source);
  }
  const config: RuntimeConfig = {
    ...initialConfig,
    gtfsToJsonVersion: packageJson.version,
    log: log(initialConfig),
  };
  // Reject legacy files before v5 opens them and changes SQLite journal settings.
  if (
    initialConfig.sqlitePath &&
    initialConfig.sqlitePath !== ':memory:' &&
    existsSync(initialConfig.sqlitePath)
  ) {
    const probe = new DatabaseSync(initialConfig.sqlitePath, {
      readOnly: true,
    });
    try {
      const columns = probe.prepare('PRAGMA table_info(agency)').all();
      if (
        columns.length > 0 &&
        !columns.some((column) => column.name === 'source_id')
      ) {
        throw new Error(
          'This is a v4 GTFS database. Set sqlitePath to a fresh v5 file and reimport the original feeds.',
        );
      }
    } finally {
      probe.close();
    }
  }
  const gtfs = new Gtfs({
    database: initialConfig.db
      ? { client: initialConfig.db }
      : { path: initialConfig.sqlitePath ?? ':memory:' },
    sources: initialConfig.skipImport
      ? [...new Set(initialConfig.agencies.map(sourceIdFor))].map(
          (sourceId) => ({ sourceId }),
        )
      : [...sources.values()],
    extensions: [],
    reporting: {
      level:
        initialConfig.logLevel === 'warning'
          ? 'warn'
          : (initialConfig.logLevel ?? 'info'),
      reporter: initialConfig.logFunction
        ? (event) => initialConfig.logFunction!(event.message)
        : createConsoleReporter(),
    },
  });
  try {
    config.log(`Started JSON creation for ${config.agencies.length} agencies.`);
    if (!config.skipImport) {
      const result = await gtfs.import();
      if (!result.success) {
        throw new AggregateError(
          result.errors,
          'GTFS import failed; output was not generated.',
        );
      }
    }
    for (const agency of config.agencies) {
      // Preflight the selected source before replacing any existing output.
      const sourceAgency = await gtfs.schedule.agency
        .where({ source_id: sourceIdFor(agency) })
        .first();
      if (!sourceAgency) {
        throw new Error(
          `No imported feed for sourceId ${sourceIdFor(agency)}.`,
        );
      }
    }
    for (const agency of config.agencies) {
      const timer = new Timer();
      timer.start();
      const outputStats = { routes: 0, stops: 0 };
      const exportPath = getExportPath(agency.agencyKey);
      await rm(exportPath, { recursive: true, force: true });
      await mkdir(exportPath, { recursive: true });
      await buildAgencyJSON(gtfs, agency, outputStats);
      const feedInfo = await gtfs.schedule.feedInfo
        .where({ source_id: sourceIdFor(agency) })
        .first();
      await writeSanitizedFile(
        exportPath,
        'log.txt',
        generateLogText(agency, outputStats, config, feedInfo?.feed_version),
      );
      config.log(
        `JSON for ${agency.agencyKey} created at ${process.cwd()}/${exportPath}`,
      );
      logStats(outputStats, config);
      timer.stop();
      config.log(
        `JSON generation required ${msToSeconds(timer.time())} seconds`,
      );
    }
  } finally {
    await gtfs.close();
  }
};

export default gtfsToJson;
