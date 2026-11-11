import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  cp,
  readdir,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { exportJSON } from '../dist/index.js';

const fixture = fileURLToPath(new URL('./fixtures/feed', import.meta.url));
const cli = fileURLToPath(
  new URL('../dist/bin/gtfs-to-json.js', import.meta.url),
);
async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'json-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    root,
    config: {
      reporting: { level: 'silent' },
      sources: [{ sourceId: 'bus', schedule: { path: fixture } }],
      export: { outputDirectory: path.join(root, 'out') },
    },
  };
}
const read = async (config, source = 'bus') =>
  JSON.parse(
    await readFile(
      path.join(config.export.outputDirectory, source, source + '.json'),
      'utf8',
    ),
  );

test('preserves route identities, agency IDs, ordering, stations and source isolation', async (t) => {
  const { config } = await setup(t);
  config.sources.push({ sourceId: 'rail', schedule: { path: fixture } });
  const result = await exportJSON(config);
  assert.deepEqual(result.files, ['bus/bus.json', 'rail/rail.json']);
  const routes = await read(config);
  assert.deepEqual(
    routes.map((route) => route.route_id),
    ['dup', 'r2', 'r10', 'other', 'blank'],
  );
  assert.equal(routes[0].agency_id, 'A');
  assert.equal(routes[3].agency_id, 'B');
  assert.equal(routes[0].route_full_name, '2 - Duplicate');
  assert.deepEqual(
    routes[0].stops.map((stop) => stop.stop_id),
    ['far', 'near', 'solo'],
  );
  assert.ok(
    (await read(config, 'rail')).every((route) => route.source_id === 'rail'),
  );
  await exportJSON({
    ...config,
    export: {
      ...config.export,
      overwrite: true,
      sourceId: 'bus',
      agencyId: 'B',
      stopMergeDistanceMeters: 0,
    },
  });
  const filtered = await read(config);
  assert.deepEqual(
    filtered.map((route) => route.route_id),
    ['other'],
  );
  assert.deepEqual(
    filtered[0].stops.map((stop) => stop.stop_id),
    ['far', 'near', 'parent', 'solo'],
  );
});

test('database-only export and missing-source rejection', async (t) => {
  const { root, config } = await setup(t);
  config.database = { path: path.join(root, 'transit.sqlite') };
  await exportJSON(config);
  const expected = await read(config);
  config.sources = [{ sourceId: 'bus' }];
  config.export.overwrite = true;
  await exportJSON(config);
  assert.deepEqual(await read(config), expected);
  await assert.rejects(
    exportJSON({ ...config, sources: [{ sourceId: 'absent' }] }),
    /No imported Schedule data/,
  );
  assert.deepEqual(await read(config), expected);
});

test('staged replacement preserves output and unrelated files on failures', async (t) => {
  const { root, config } = await setup(t);
  await exportJSON(config);
  const expected = await read(config);
  await assert.rejects(exportJSON(config), /overwrite/);
  config.export.overwrite = true;
  await assert.rejects(
    exportJSON({
      ...config,
      sources: [{ sourceId: 'bus', schedule: { path: '/missing/feed' } }],
    }),
  );
  assert.deepEqual(await read(config), expected);
  await writeFile(path.join(config.export.outputDirectory, 'keep.txt'), 'keep');
  await assert.rejects(exportJSON(config), /unrelated/);
  assert.equal(
    await readFile(
      path.join(config.export.outputDirectory, 'keep.txt'),
      'utf8',
    ),
    'keep',
  );
  await symlink(config.export.outputDirectory, path.join(root, 'link'));
  await assert.rejects(
    exportJSON({
      ...config,
      export: { outputDirectory: path.join(root, 'link') },
    }),
    /dedicated/,
  );
});

test('missing parents retain child stops and missing metadata is allowed', async (t) => {
  const { root, config } = await setup(t);
  const feed = path.join(root, 'feed');
  await cp(fixture, feed, { recursive: true });
  await rm(path.join(feed, 'feed_info.txt'));
  const stops = await readFile(path.join(feed, 'stops.txt'), 'utf8');
  await writeFile(
    path.join(feed, 'stops.txt'),
    stops.replace('0,parent', '0,missing'),
  );
  config.sources[0].schedule.path = feed;
  await exportJSON(config);
  assert.ok(
    (await read(config))[0].stops.some((stop) => stop.stop_id === 'child'),
  );
});

test('duplicate import keys fail without replacing output and keep-first is supported', async (t) => {
  const { root, config } = await setup(t);
  await exportJSON(config);
  const expected = await read(config);
  const feed = path.join(root, 'feed');
  await cp(fixture, feed, { recursive: true });
  const routes = await readFile(path.join(feed, 'routes.txt'), 'utf8');
  await writeFile(
    path.join(feed, 'routes.txt'),
    routes + 'r10,A,999,Duplicate key,3\n',
  );
  config.sources[0].schedule = { path: feed };
  config.export.overwrite = true;
  await assert.rejects(exportJSON(config));
  assert.deepEqual(await read(config), expected);
  config.sources[0].schedule.import = {
    validation: { onDuplicateKey: 'keep-first' },
  };
  await exportJSON(config);
  assert.deepEqual(await read(config), expected);
});

test('validates config and encodes unsafe and case-colliding source IDs', async (t) => {
  const { config } = await setup(t);
  for (const bad of [
    null,
    [],
    { agencies: [] },
    { ...config, export: { typo: true } },
    { ...config, export: { stopMergeDistanceMeters: -1 } },
    { ...config, sources: [{ sourceId: 'bus' }] },
    { ...config, export: { sourceId: 'unknown' } },
  ]) {
    await assert.rejects(exportJSON(bad));
  }
  config.sources = ['BUS', 'bus', '../outside'].map((sourceId) => ({
    sourceId,
    schedule: { path: fixture },
  }));
  const result = await exportJSON(config);
  assert.equal(new Set(result.files.map((file) => file.toLowerCase())).size, 3);
  assert.ok(result.files.every((file) => !file.includes('..')));
  assert.equal((await readdir(config.export.outputDirectory)).length, 4);
});

test('CLI direct input, config overrides, help, version and stderr errors', async (t) => {
  const { root, config } = await setup(t);
  const run = (...args) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
  assert.equal(run('--help').status, 0);
  assert.match(run('--version').stdout, /^\d+\.\d+\.\d+/);
  const first = run(
    '--input',
    fixture,
    '--output',
    config.export.outputDirectory,
    '--log-level',
    'silent',
  );
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, '');
  await writeFile(path.join(root, 'config.json'), JSON.stringify(config));
  const second = run(
    '--config',
    'config.json',
    '--overwrite',
    '--agency-id',
    'B',
  );
  assert.equal(second.status, 0, second.stderr);
  assert.equal((await read(config)).length, 1);
  for (const args of [
    ['--skipImport'],
    ['--input', fixture, '--url', 'https://example.com'],
    ['--config', 'missing.json'],
    ['--log-level', 'bogus'],
  ]) {
    const result = run(...args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.trim());
  }
});

test('legacy databases are rejected without changing their bytes', async (t) => {
  const { DatabaseSync } = await import('node:sqlite');
  const { root, config } = await setup(t);
  const databasePath = path.join(root, 'legacy.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(
    'CREATE TABLE agency (agency_id TEXT PRIMARY KEY, agency_name TEXT)',
  );
  legacy.close();
  const before = await readFile(databasePath);
  await assert.rejects(
    exportJSON({
      ...config,
      database: { path: databasePath },
      sources: [{ sourceId: 'bus' }],
    }),
  );
  assert.deepEqual(await readFile(databasePath), before);
});
