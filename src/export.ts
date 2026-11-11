import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { Gtfs } from 'gtfs';
import { resolveExport, type JSONConfig } from './config.ts';
import { checkDatabase } from './io/database.ts';
import { readRoutes } from './data/routes.ts';
import { createComponentEncoder, writeDataset } from './io/output.ts';

export async function exportJSON(config: JSONConfig) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Expected a configuration object.');
  }
  const {
    sources: configuredSources,
    database = { path: ':memory:' },
    export: options,
    ...shared
  } = config;
  for (const key of Object.keys(shared)) {
    if (!['reporting', 'extensions', 'realtime'].includes(key)) {
      throw new Error(
        'Unknown configuration option: ' +
          key +
          '. See README migration notes.',
      );
    }
  }
  const settings = resolveExport(options);
  const sources =
    configuredSources ??
    (config.database ? [{ sourceId: settings.sourceId ?? 'default' }] : []);
  if (!Array.isArray(sources) || !sources.length) {
    throw new Error('Configure at least one Schedule source in sources.');
  }
  const ids = new Set<string>();
  for (const source of sources) {
    const id = source?.sourceId ?? 'default';
    if (
      !source ||
      typeof id !== 'string' ||
      !id.trim() ||
      ids.has(id) ||
      (sources.length > 1 && !source.sourceId)
    ) {
      throw new Error(
        'Multiple sources require distinct, explicit sourceId values.',
      );
    }
    if (
      !source.schedule &&
      (!config.database || database.path === ':memory:')
    ) {
      throw new Error('Sources without schedule require an existing database.');
    }
    ids.add(id);
  }
  if (settings.sourceId !== undefined && !ids.has(settings.sourceId)) {
    throw new Error('Unknown export.sourceId: ' + settings.sourceId);
  }
  if (database.path && database.path !== ':memory:') {
    const outputPath = path.resolve(settings.outputDirectory);
    const databasePath = path.resolve(database.path);
    if (
      databasePath === outputPath ||
      databasePath.startsWith(outputPath + path.sep)
    ) {
      throw new Error('Keep database.path outside export.outputDirectory.');
    }
  }
  await checkDatabase(database.path);
  return writeDataset(
    settings.outputDirectory,
    settings.overwrite,
    async (stage) => {
      const files: string[] = [];
      const encode = createComponentEncoder();
      for (const source of sources) {
        const sourceId = source.sourceId ?? 'default';
        if (settings.sourceId !== undefined && settings.sourceId !== sourceId) {
          continue;
        }
        const gtfs = new Gtfs({ ...shared, database, sources: [source] });
        try {
          if (source.schedule) {
            const result = await gtfs.import();
            if (!result.success) {
              throw new AggregateError(
                result.errors,
                'Schedule import failed for ' + sourceId,
              );
            }
          }
          if (
            !(await gtfs.schedule.agency.where({ source_id: sourceId }).first())
          ) {
            throw new Error('No imported Schedule data for ' + sourceId);
          }
          const routes = await readRoutes(gtfs, sourceId, settings);
          const folder = encode(sourceId);
          await mkdir(path.join(stage, folder));
          const file = folder + '/' + folder + '.json';
          await writeFile(
            path.join(stage, file),
            JSON.stringify(routes, null, 2) + '\n',
            { flag: 'wx' },
          );
          files.push(file);
          gtfs.reporting.log({
            level: 'info',
            message:
              sourceId +
              ': wrote ' +
              routes.length +
              ' routes to ' +
              path.resolve(settings.outputDirectory, file),
          });
        } finally {
          await gtfs.close();
        }
      }
      return files;
    },
  );
}
