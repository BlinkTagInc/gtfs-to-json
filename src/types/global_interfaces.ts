export interface IConfig {
  db?: any;
  sqlitePath?: string;
  agencies: {
    path?: string;
    url?: string;
    agencyKey: string;
    agencyId?: string | number;
  }[];
  logLevel?: string;
  skipImport?: boolean;
  log: Function;
  logWarning: Function;
}
