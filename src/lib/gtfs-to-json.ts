import path from 'node:path';
import { rm, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { clone, omit, sortBy, uniqBy } from 'lodash-es';
import { openDb, importGtfs } from 'gtfs';
import Timer from 'timer-machine';

import { getExportPath, writeSanitizedFile } from './file-utils.ts';
import { getRouteName, msToSeconds } from './formatters.ts';
import { log, logWarning, generateLogText, logStats } from './log-utils.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(path.join(__dirname, '../../package.json'), 'utf8'),
);
const { version } = packageJson;
import { IConfig } from '../types/global_interfaces.ts';

const setDefaultConfig = (config: IConfig) => {
  const defaults = {
    gtfsToJsonVersion: version,
    skipImport: false,
    verbose: true,
  };

  return Object.assign(defaults, config);
};

const buildAgencyJSON = async (agencyKey: string, config: IConfig, outputStats: Record<string, number>) => {
  const db = openDb(config);
  const routes: {
    route_id: string;
    route_short_name?: string;
    route_long_name?: string;
    route_type?: number;
    route_full_name?: string;
    stops?: {
      stop_id: string;
      stop_name: string;
      stop_lat: number;
      stop_lon: number;
    }[];
    agency_id?: string;
  }[] = db
    .prepare(
      'SELECT route_id, route_short_name, route_long_name, route_type FROM routes ORDER BY route_short_name',
    )
    .all();

  const routesJSON = sortBy(uniqBy(routes, 'route_short_name'), (route) =>
    parseInt(route.route_short_name ?? '', 10),
  );

  for (const route of routesJSON) {
    const stops: {
      stop_id: string;
      stop_name: string;
      stop_lat: number;
      stop_lon: number;
    }[] = db
      .prepare(
        'SELECT stops.stop_id, stops.stop_name, stops.stop_lat, stops.stop_lon from stops INNER JOIN stop_times ON stops.stop_id = stop_times.stop_id INNER JOIN trips on trips.trip_id = stop_times.trip_id WHERE trips.route_id = ? ORDER BY stops.stop_name',
      )
      .all(route.route_id);

    route.route_full_name = getRouteName(route);
    route.stops = uniqBy(stops, (stop) => stop.stop_name);
    route.agency_id = agencyKey;
    outputStats.stops += route.stops.length;
  }

  outputStats.routes += routesJSON.length;

  await writeSanitizedFile(
    getExportPath(agencyKey),
    `${agencyKey}.json`,
    JSON.stringify(routesJSON, null, 2),
  );
};

const gtfsToJson = async (initialConfig: IConfig) => {
  const config = setDefaultConfig(initialConfig);
  config.log = log(config);
  config.logWarning = logWarning(config);

  await openDb(config);

  config.log(`Started JSON creation for ${config.agencies.length} agencies.`);

  /* eslint-disable no-await-in-loop */
  for (const agency of config.agencies) {
    const timer = new Timer();
    timer.start();

    const outputStats = {
      routes: 0,
      stops: 0,
    };

    const agencyKey = agency.agencyKey;
    const exportPath = getExportPath(agencyKey);

    if (config.skipImport !== true) {
      // Import GTFS
      const agencyConfig = {
        ...clone(omit(config, 'agencies')),
        agencies: [
          {
            exclude: [
              'areas',
              'attributions',
              'calendar_attributes',
              'directions',
              'fare_attributes',
              'fare_transfer_rules',
              'fare_leg_rules',
              'fare_products',
              'fare_rules',
              'feed_info',
              'levels',
              'pathways',
              'route_attributes',
              'shapes',
            ],
            ...agency,
          },
        ]
      };

      await importGtfs(agencyConfig);
    }

    await rm(exportPath, { recursive: true, force: true });
    await mkdir(exportPath, { recursive: true });
    config.log(`Starting JSON creation for ${agencyKey}`);

    await buildAgencyJSON(agencyKey, config, outputStats);

    let jsonPath = `${process.cwd()}/${exportPath}`;

    // Generate output log.txt
    const logText = generateLogText(agency, outputStats, config);
    await writeSanitizedFile(exportPath, 'log.txt', logText);

    config.log(`JSON for ${agencyKey} created at ${jsonPath}`);

    logStats(outputStats, config);

    timer.stop();
    config.log(`JSON generation required ${msToSeconds(timer.time())} seconds`);
  }
  /* eslint-enable no-await-in-loop */
};

export default gtfsToJson;
