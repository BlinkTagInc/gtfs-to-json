import { existsSync } from 'node:fs';

/** Reject v4 SQLite files before opening v5 changes their journal settings. */
export async function checkDatabase(databasePath: string | undefined) {
  if (
    !databasePath ||
    databasePath === ':memory:' ||
    !existsSync(databasePath)
  ) {
    return;
  }
  const { DatabaseSync } = await import('node:sqlite');
  const probe = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const columns = probe.prepare('PRAGMA table_info(agency)').all();
    if (
      columns.length &&
      !columns.some((column) => column.name === 'source_id')
    ) {
      throw new Error(
        'This is a v4 GTFS database. Reimport the original feeds into a fresh v5 database.',
      );
    }
  } finally {
    probe.close();
  }
}
