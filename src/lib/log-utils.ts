import { clearLine, cursorTo } from 'node:readline';
import * as colors from 'yoctocolors';
import type {
  AgencyConfig,
  IConfig,
  RuntimeConfig,
} from '../types/global_interfaces.ts';
import { noop } from 'lodash-es';
import Table from 'cli-table';

/*
 * Creates text for a log of output details.
 */
export function generateLogText(
  agency: AgencyConfig,
  outputStats: Record<string, number>,
  config: RuntimeConfig,
  version?: string | null,
) {
  const feedVersion = version || 'Unknown';

  const logText = [
    `Feed Version: ${feedVersion}`,
    `GTFS-to-JSON Version: ${config.gtfsToJsonVersion}`,
    `Date Generated: ${new Date()}`,
    `Route Count: ${outputStats.routes}`,
    `Stop Count: ${outputStats.stops}`,
  ];

  if (agency.url) {
    logText.push(`Source: ${agency.url}`);
  } else if (agency.path) {
    logText.push(`Source: ${agency.path}`);
  }

  return logText.join('\n');
}

/*
 * Returns a log function based on config settings
 */
export function log(config: IConfig) {
  if (config.logLevel === 'silent') {
    return noop;
  }

  if (config.logFunction) {
    return config.logFunction;
  }

  return (text: string, overwrite?: boolean) => {
    if (overwrite === true && process.stdout.isTTY) {
      clearLine(process.stdout, 0);
      cursorTo(process.stdout, 0);
    } else {
      process.stdout.write('\n');
    }

    process.stdout.write(text);
  };
}

/*
 * Returns an warning log function based on config settings
 */
export function logWarning(config: IConfig) {
  if (config.logFunction) {
    return config.logFunction;
  }

  return (text: string) => {
    process.stdout.write(`\n${formatWarning(text)}\n`);
  };
}

/*
 * Returns an error log function based on config settings
 */
export function logError(config: IConfig) {
  if (config.logFunction) {
    return config.logFunction;
  }

  return (text: string) => {
    process.stdout.write(`\n${formatError(text)}\n`);
  };
}

/*
 * Format console warning text
 */
export function formatWarning(text: string) {
  const warningMessage = `${colors.underline('Warning')}: ${text}`;
  return colors.yellow(warningMessage);
}

/*
 * Format console error text
 */
export function formatError(error: Error | string) {
  const messageText = error instanceof Error ? error.message : error;
  const errorMessage = `${colors.underline('Error')}: ${messageText.replace(
    'Error: ',
    '',
  )}`;
  return colors.red(errorMessage);
}

/*
 * Print a table of stats to the console.
 */
export function logStats(stats: Record<string, number>, config: RuntimeConfig) {
  // Hide stats table from custom log functions
  if (config.logFunction) {
    return;
  }

  const table = new Table({
    colWidths: [40, 20],
    head: ['Item', 'Count'],
  });

  table.push(
    ['🔄 Routes', String(stats.routes)],
    ['🔄 Stops', String(stats.stops)],
  );

  config.log(table.toString());
}
