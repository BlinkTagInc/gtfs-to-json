import assert from 'node:assert/strict';
import test from 'node:test';

import { deduplicateStops } from '../src/data/stops.ts';

function stop(id, name, feetNorth = 0) {
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

test('does not merge unnamed stops or stops with missing coordinates', () => {
  const first = stop('a', '');
  const second = stop('b', '');
  assert.deepEqual(deduplicateStops([first, second]), [first, second]);
  const missing = { ...stop('c', 'Central'), stop_lat: null };
  const named = stop('d', 'Central');
  assert.deepEqual(deduplicateStops([missing, named]), [missing, named]);
  assert.deepEqual(
    deduplicateStops([named, stop('e', 'Central')], 0).length,
    2,
  );
});
