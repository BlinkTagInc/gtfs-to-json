import assert from 'node:assert/strict';
import test from 'node:test';

import { deduplicateStops } from '../src/lib/stop-utils.ts';

function stop(id: string, name: string, feetNorth = 0) {
  return {
    stop_id: id,
    stop_name: name,
    stop_lat: ((feetNorth * 0.3048) / 6371008.8) * (180 / Math.PI),
    stop_lon: 0,
  };
}

test('deduplicates IDs and exact names within 1,000 feet', () => {
  const first = stop('a', 'Central');
  const distant = stop('c', 'Central', 1001);
  const differentCase = stop('d', 'central');
  const differentWhitespace = stop('e', 'Central ');
  assert.deepEqual(
    deduplicateStops([
      first,
      first,
      stop('b', 'Central', 999),
      distant,
      differentCase,
      differentWhitespace,
    ]),
    [first, distant, differentCase, differentWhitespace],
  );
});

test('includes the 1,000-foot boundary and compares against retained stops', () => {
  const first = stop('a', 'Central');
  const last = stop('c', 'Central', 1800);
  assert.deepEqual(deduplicateStops([first, stop('b', 'Central', 1000)]), [
    first,
  ]);
  assert.deepEqual(deduplicateStops([first, stop('b', 'Central', 900), last]), [
    first,
    last,
  ]);
});

test('uses longitude as well as latitude and keeps calls independent', () => {
  const first = stop('a', 'Central');
  const nearby = {
    ...stop('b', 'Central'),
    stop_lon: stop('', '', 999).stop_lat,
  };
  const distant = {
    ...stop('c', 'Central'),
    stop_lon: stop('', '', 1001).stop_lat,
  };
  assert.deepEqual(deduplicateStops([first, nearby, distant]), [
    first,
    distant,
  ]);
  assert.deepEqual(deduplicateStops([nearby]), [nearby]);
});
