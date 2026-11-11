import type { GtfsDatabaseConfig } from 'gtfs';

export type LogFunction = (text: string, overwrite?: boolean) => void;

export interface AgencyConfig {
  path?: string;
  url?: string;
  agencyKey: string;
  sourceId?: string;
  agencyId?: string | number;
  headers?: Record<string, string>;
}

export interface IConfig {
  db?: GtfsDatabaseConfig['client'];
  sqlitePath?: string;
  agencies: AgencyConfig[];
  logLevel?: 'silent' | 'error' | 'warning' | 'info';
  skipImport?: boolean;
  ignoreDuplicates?: boolean;
  downloadTimeout?: number;
  logFunction?: LogFunction;
}

export interface RuntimeConfig extends IConfig {
  gtfsToJsonVersion: string;
  log: LogFunction;
}
