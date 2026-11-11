import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Gtfs } from 'gtfs';
import { DatabaseSync } from 'node:sqlite';
import gtfsToJson from '../src/lib/gtfs-to-json.ts';

const fixture = fileURLToPath(new URL('./fixtures/feed', import.meta.url));
const expected = JSON.parse(
  await readFile(
    new URL('./fixtures/expected-routes.json', import.meta.url),
    'utf8',
  ),
);
const cli = fileURLToPath(
  new URL('../dist/bin/gtfs-to-json.js', import.meta.url),
);

test('v4 output parity, overlapping IDs, source metadata, reopen and CLI', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gtfs-json-test-'));
  const cwd = process.cwd();
  try {
    process.chdir(root);
    const second = path.join(root, 'second');
    await cp(fixture, second, { recursive: true });
    await writeFile(
      path.join(second, 'stops.txt'),
      (await readFile(path.join(second, 'stops.txt'), 'utf8')).replaceAll(
        'Central',
        'Second Central',
      ),
    );
    await writeFile(
      path.join(second, 'feed_info.txt'),
      (await readFile(path.join(second, 'feed_info.txt'), 'utf8')).replace(
        'fixture-v1',
        'fixture-v2',
      ),
    );
    const config = {
      logLevel: 'silent' as const,
      sqlitePath: path.join(root, 'v5.sqlite'),
      agencies: [
        {
          agencyKey: 'fixture',
          sourceId: 'first',
          agencyId: 'A',
          path: fixture,
        },
        {
          agencyKey: 'second',
          sourceId: 'second',
          agencyId: 'A',
          path: second,
        },
        {
          agencyKey: 'other-agency',
          sourceId: 'first',
          agencyId: 'B',
          path: fixture,
        },
      ],
    };
    assert.equal(await gtfsToJson(config), undefined);
    const readOutput = async (key: string) =>
      JSON.parse(await readFile(`output/${key}/${key}.json`, 'utf8'));
    assert.deepEqual(await readOutput('fixture'), expected);
    assert.deepEqual(
      await readOutput('second'),
      expected.map((route) => ({
        ...route,
        agency_id: 'second',
        stops: route.stops
          .map((stop) => ({
            ...stop,
            stop_name: stop.stop_name.replace('Central', 'Second Central'),
          }))
          .sort(
            (a, b) =>
              a.stop_name.localeCompare(b.stop_name) ||
              a.stop_id.localeCompare(b.stop_id),
          ),
      })),
    );
    assert.deepEqual(
      (await readOutput('other-agency')).map((route) => route.route_id),
      ['other'],
    );
    assert.match(
      await readFile('output/fixture/log.txt', 'utf8'),
      /Feed Version: fixture-v1/,
    );
    assert.match(
      await readFile('output/second/log.txt', 'utf8'),
      /Feed Version: fixture-v2/,
    );
    await gtfsToJson({ ...config, skipImport: true });
    assert.deepEqual(await readOutput('fixture'), expected);
    await writeFile('config.json', JSON.stringify(config));
    const cliResult = spawnSync(
      process.execPath,
      [cli, '--configPath', 'config.json', '--skipImport'],
      { encoding: 'utf8' },
    );
    assert.equal(cliResult.status, 0, cliResult.stderr);
    await writeFile(
      'config.json',
      JSON.stringify({
        ...config,
        skipImport: true,
        agencies: config.agencies.map((agency) => ({
          ...agency,
          path: '/does-not-exist',
        })),
      }),
    );
    const configOnly = spawnSync(
      process.execPath,
      [cli, '--config', 'config.json'],
      { encoding: 'utf8' },
    );
    assert.equal(configOnly.status, 0, configOnly.stderr);

    assert.deepEqual(await readOutput('fixture'), expected);
    const gtfs = new Gtfs({
      database: { path: config.sqlitePath },
      sources: [{ sourceId: 'first' }, { sourceId: 'second' }],
    });
    try {
      assert.equal(await gtfs.schedule.routes.count(), 10);
    } finally {
      await gtfs.close();
    }
    // Missing sources must not erase the previous output.
    await assert.rejects(
      gtfsToJson({
        ...config,
        skipImport: true,
        agencies: [{ agencyKey: 'fixture', sourceId: 'absent' }],
      }),
      /No imported feed/,
    );
    assert.deepEqual(await readOutput('fixture'), expected);
  } finally {
    process.chdir(cwd);
    await rm(root, { recursive: true, force: true });
  }
});

test('in-memory lifetime, missing metadata and failed imports preserve output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gtfs-json-memory-'));
  const cwd = process.cwd();
  try {
    process.chdir(root);
    await cp(fixture, 'feed', { recursive: true });
    await rm('feed/feed_info.txt');
    const config = {
      agencies: [
        { agencyKey: 'fixture', agencyId: 'A', path: path.join(root, 'feed') },
      ],
      logLevel: 'silent' as const,
    };
    await gtfsToJson(config);
    assert.deepEqual(
      JSON.parse(await readFile('output/fixture/fixture.json', 'utf8')),
      expected,
    );
    assert.match(
      await readFile('output/fixture/log.txt', 'utf8'),
      /Feed Version: Unknown/,
    );
    const original = await readFile('output/fixture/fixture.json', 'utf8');
    const routes = await readFile('feed/routes.txt', 'utf8');
    await writeFile('feed/routes.txt', routes + 'r10,A,999,Duplicate key,3\n');
    await assert.rejects(gtfsToJson(config));
    assert.equal(
      await readFile('output/fixture/fixture.json', 'utf8'),
      original,
    );
    await gtfsToJson({ ...config, ignoreDuplicates: true });
    assert.equal(
      await readFile('output/fixture/fixture.json', 'utf8'),
      original,
    );
    await assert.rejects(
      gtfsToJson({ ...config, skipImport: true }),
      /existing v5/,
    );
    await assert.rejects(
      gtfsToJson({
        ...config,
        agencies: [{ ...config.agencies[0], path: '/nonexistent/feed' }],
      }),
    );
    // Another import after failure must not inherit a closed/global in-memory DB.
    await gtfsToJson({ ...config, ignoreDuplicates: true });
  } finally {
    process.chdir(cwd);
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects legacy files without modifying them', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gtfs-json-legacy-'));
  const sqlitePath = path.join(root, 'v4.sqlite');
  try {
    const legacy = new DatabaseSync(sqlitePath);
    legacy.exec(
      'CREATE TABLE agency (agency_id TEXT PRIMARY KEY, agency_name TEXT)',
    );
    legacy.close();
    const before = await readFile(sqlitePath);
    await assert.rejects(
      gtfsToJson({
        sqlitePath,
        skipImport: true,
        logLevel: 'silent',
        agencies: [{ agencyKey: 'fixture' }],
      }),
      /v4 GTFS database/,
    );
    assert.deepEqual(await readFile(sqlitePath), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
