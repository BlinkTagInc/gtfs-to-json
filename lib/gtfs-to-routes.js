import { readFileSync } from 'node:fs';
import { rm, mkdir } from 'node:fs/promises';

import { clone, omit, sortBy, uniqBy } from 'lodash-es';
import { openDb, importGtfs } from 'gtfs';
import Timer from 'timer-machine';

import { getExportPath, writeSanitizedFile } from './file-utils.js';
import { getRouteName, msToSeconds } from './formatters.js';
import { log, logWarning, generateLogText, logStats } from './log-utils.js';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url)),
);

const setDefaultConfig = (config) => {
  const defaults = {
    gtfsToRoutesVersion: version,
    skipImport: false,
    verbose: true,
  };

  return Object.assign(defaults, config);
};

const buildAgencyJSON = async (agencyKey, config, outputStats) => {
  const db = openDb(config);
  const routes = db
    .prepare(
      'SELECT route_id, route_short_name, route_long_name, route_type FROM routes ORDER BY route_short_name',
    )
    .all();

  const routesJSON = sortBy(uniqBy(routes, 'route_short_name'), (route) =>
    parseInt(route.route_short_name, 10),
  );

  for (const route of routesJSON) {
    const stops = db
      .prepare(
        'SELECT stops.stop_id, stops.stop_name, stops.stop_lat, stops.stop_lon from stops INNER JOIN stop_times ON stops.stop_id = stop_times.stop_id INNER JOIN trips on trips.trip_id = stop_times.trip_id WHERE trips.route_id = ? ORDER BY stops.stop_name',
      )
      .all(route.route_id);

    route.route_full_name = getRouteName(route);
    route.stops = uniqBy(stops, (stop) => stop.stop_name);
    route.agency_id = agencyKey;
    outputStats.stops += stops.length;
  }

  outputStats.routes += routesJSON.length;

  await writeSanitizedFile(
    getExportPath(agencyKey),
    `${agencyKey}.json`,
    JSON.stringify(routesJSON),
  );
};

const gtfsToRoutes = async (initialConfig) => {
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

    const agencyKey = agency.agency_key;
    const exportPath = getExportPath(agencyKey);

    if (config.skipImport !== true) {
      // Import GTFS
      const agencyConfig = clone(omit(config, 'agencies'));
      agencyConfig.agencies = [
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
      ];

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

export default gtfsToRoutes;
