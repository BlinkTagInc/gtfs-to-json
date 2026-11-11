import type { GtfsInstanceOptions } from 'gtfs';

export interface JSONExportOptions {
  sourceId?: string;
  agencyId?: string;
  outputDirectory?: string;
  overwrite?: boolean;
  stopMergeDistanceMeters?: number;
}

export type JSONConfig = Omit<GtfsInstanceOptions, 'database' | 'export'> & {
  database?: GtfsInstanceOptions['database'];
  export?: JSONExportOptions;
};

export function resolveExport(options: JSONExportOptions = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('export must be an object.');
  }
  for (const key of Object.keys(options)) {
    if (
      ![
        'sourceId',
        'agencyId',
        'outputDirectory',
        'overwrite',
        'stopMergeDistanceMeters',
      ].includes(key)
    ) {
      throw new Error('Unknown export option: ' + key);
    }
  }
  const result = {
    outputDirectory: './json',
    overwrite: false,
    stopMergeDistanceMeters: 304.8,
    ...options,
  };
  if (
    typeof result.outputDirectory !== 'string' ||
    !result.outputDirectory.trim()
  ) {
    throw new Error('Expected export.outputDirectory.');
  }
  for (const key of ['sourceId', 'agencyId'] as const) {
    if (
      result[key] !== undefined &&
      (typeof result[key] !== 'string' || !result[key].trim())
    ) {
      throw new Error('Expected a nonempty export.' + key + ' string.');
    }
  }
  if (typeof result.overwrite !== 'boolean') {
    throw new Error('export.overwrite must be a boolean.');
  }
  if (
    !Number.isFinite(result.stopMergeDistanceMeters) ||
    result.stopMergeDistanceMeters < 0
  ) {
    throw new Error(
      'export.stopMergeDistanceMeters must be a nonnegative number.',
    );
  }
  return result;
}
export type ExportSettings = ReturnType<typeof resolveExport>;
