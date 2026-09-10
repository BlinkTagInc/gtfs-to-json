interface Stop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
}

const earthRadiusMeters = 6371008.8;
const duplicateDistanceMeters = 1000 * 0.3048;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function areNearby(first: Stop, second: Stop): boolean {
  const coordinates = [
    first.stop_lat,
    first.stop_lon,
    second.stop_lat,
    second.stop_lon,
  ];
  if (!coordinates.every(Number.isFinite)) {
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
  return distance <= duplicateDistanceMeters + 1e-6;
}

export function deduplicateStops<T extends Stop>(stops: T[]): T[] {
  const seenIds = new Set<string>();
  const stopsByName = new Map<string, T[]>();
  const result: T[] = [];

  for (const stop of stops) {
    if (seenIds.has(stop.stop_id)) {
      continue;
    }
    seenIds.add(stop.stop_id);

    const sameNameStops = stopsByName.get(stop.stop_name) ?? [];
    if (sameNameStops.some((existing) => areNearby(existing, stop))) {
      continue;
    }

    sameNameStops.push(stop);
    stopsByName.set(stop.stop_name, sameNameStops);
    result.push(stop);
  }

  return result;
}
