interface Stop {
  stop_id: string;
  stop_name: string | null;
  stop_lat: number | null;
  stop_lon: number | null;
}

const earthRadiusMeters = 6371008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function areNearby(first: Stop, second: Stop, distanceMeters: number): boolean {
  const coordinates = [
    first.stop_lat,
    first.stop_lon,
    second.stop_lat,
    second.stop_lon,
  ];
  if (
    first.stop_lat === null ||
    first.stop_lon === null ||
    second.stop_lat === null ||
    second.stop_lon === null ||
    !coordinates.every(Number.isFinite)
  ) {
    return false;
  }

  const latitudeDifference = toRadians(second.stop_lat - first.stop_lat);
  const longitudeDifference = toRadians(second.stop_lon - first.stop_lon);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(toRadians(first.stop_lat)) *
      Math.cos(toRadians(second.stop_lat)) *
      Math.sin(longitudeDifference / 2) ** 2;
  const distance =
    2 * earthRadiusMeters * Math.asin(Math.sqrt(Math.min(1, haversine)));

  // Allow one micrometer of rounding error at the inclusive boundary.
  return distance <= distanceMeters + 1e-6;
}

export function deduplicateStops<T extends Stop>(
  stops: T[],
  distanceMeters = 304.8,
): T[] {
  const seenIds = new Set<string>();
  const stopsByName = new Map<string | null, T[]>();
  const result: T[] = [];

  for (const stop of stops) {
    if (seenIds.has(stop.stop_id)) {
      continue;
    }
    seenIds.add(stop.stop_id);

    const sameNameStops = stopsByName.get(stop.stop_name) ?? [];
    if (
      stop.stop_name &&
      distanceMeters > 0 &&
      sameNameStops.some((existing) =>
        areNearby(existing, stop, distanceMeters),
      )
    ) {
      continue;
    }

    sameNameStops.push(stop);
    stopsByName.set(stop.stop_name, sameNameStops);
    result.push(stop);
  }

  return result;
}
