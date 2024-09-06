export function msToSeconds(ms) {
  return Math.round(ms / 1000);
}

export function getRouteName(route) {
  const routeNameParts = [];
  if (route.route_short_name !== null && route.route_short_name !== '') {
    routeNameParts.push(route.route_short_name);
  }

  if (route.route_long_name !== null && route.route_long_name !== '') {
    routeNameParts.push(route.route_long_name);
  }

  return routeNameParts.join(' - ');
}
