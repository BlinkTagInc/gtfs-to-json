import type { Gtfs } from 'gtfs';
import { deduplicateStops } from './stops.ts';
import type { ExportSettings } from '../config.ts';

export async function readRoutes(
  gtfs: Gtfs,
  sourceId: string,
  settings: ExportSettings,
) {
  let reader = gtfs.schedule.routes
    .where({ source_id: sourceId })
    .select(
      'route_id',
      'agency_id',
      'route_short_name',
      'route_long_name',
      'route_type',
    );
  if (settings.agencyId !== undefined) {
    reader = reader.where({ agency_id: settings.agencyId });
  }
  const routes = await reader.all();
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  routes.sort((a, b) => {
    const rank = (name: string | null) => Number.parseInt(name ?? '', 10);
    const first = rank(a.route_short_name);
    const second = rank(b.route_short_name);
    return (
      (Number.isNaN(first) ? Infinity : first) -
        (Number.isNaN(second) ? Infinity : second) ||
      compare(a.route_short_name ?? '', b.route_short_name ?? '') ||
      compare(a.route_long_name ?? '', b.route_long_name ?? '') ||
      compare(a.route_id, b.route_id)
    );
  });
  const output = [];
  for (const route of routes) {
    const stops = await gtfs.database.withKysely({
      callback: (db) =>
        db
          .selectFrom('stops')
          .innerJoin('stop_times', (join) =>
            join
              .onRef('stops.source_id', '=', 'stop_times.source_id')
              .onRef('stops.stop_id', '=', 'stop_times.stop_id'),
          )
          .innerJoin('trips', (join) =>
            join
              .onRef('trips.source_id', '=', 'stop_times.source_id')
              .onRef('trips.trip_id', '=', 'stop_times.trip_id'),
          )
          .leftJoin('stops as station', (join) =>
            join
              .onRef('station.source_id', '=', 'stops.source_id')
              .onRef('station.stop_id', '=', 'stops.parent_station'),
          )
          .select((eb) => [
            eb.fn.coalesce('station.stop_id', 'stops.stop_id').as('stop_id'),
            eb.fn
              .coalesce('station.stop_name', 'stops.stop_name')
              .as('stop_name'),
            eb.fn.coalesce('station.stop_lat', 'stops.stop_lat').as('stop_lat'),
            eb.fn.coalesce('station.stop_lon', 'stops.stop_lon').as('stop_lon'),
          ])
          .where('trips.source_id', '=', sourceId)
          .where('trips.route_id', '=', route.route_id)
          .distinct()
          .orderBy('stop_name')
          .orderBy('stop_id')
          .execute(),
    });
    output.push({
      source_id: sourceId,
      ...route,
      route_full_name: [route.route_short_name, route.route_long_name]
        .filter(Boolean)
        .join(' - '),
      stops: deduplicateStops(stops, settings.stopMergeDistanceMeters),
    });
  }
  return output;
}
