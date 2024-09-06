export interface IConfig {
  db?: any;
  sqlitePath?: string;
  agencies: {
    path?: string;
    url?: string;
    agencyKey: string;
  }[];
  skipImport?: boolean;
  verbose?: boolean;
  log: Function;
  logWarning: Function;
}