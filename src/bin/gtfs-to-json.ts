#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import PrettyError from 'pretty-error'

import gtfsToJson from '../lib/gtfs-to-json.ts';
import { getConfig } from '../lib/file-utils.ts';
import { formatError } from '../lib/log-utils.ts';

const pe = new PrettyError()

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 --config ./config.json')
  .help()
  .option('c', {
    alias: 'configPath',
    describe: 'Path to config file',
    default: './config.json',
    type: 'string',
  })
  .option('s', {
    alias: 'skipImport',
    describe: "Don't import GTFS file.",
    type: 'boolean',
  })
  .default('skipImport', undefined)
  .parseSync();

  const handleError = (error = new Error('Unknown Error')) => {
    process.stdout.write(`\n${formatError(error)}\n`)
    console.error(pe.render(error))
    process.exit(1)
  }

const setupImport = async () => {
  const config = await getConfig(argv);
  await gtfsToJson(config);
  process.exit();
};

setupImport().catch(handleError);
