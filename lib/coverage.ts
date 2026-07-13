const EARTH_RADIUS = 6371000;
const CELL_SIZE_METERS = 50;
const DEFAULT_THRESHOLD_METERS = 50;

type Point = [number, number];

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function haversine(a: Point, b: Point) {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

function lngStepAt(lat: number) {
  return CELL_SIZE_METERS / (111320 * Math.max(Math.cos(toRad(lat)), 0.1));
}

const latStep = CELL_SIZE_METERS / 111320;

export type ActivityIndex = {
  isNear: (point: Point, thresholdMeters?: number) => boolean;
};

export function buildActivityIndex(activityPointSets: Point[][]): ActivityIndex {
  const grid = new Map<string, Point[]>();

  for (const points of activityPointSets) {
    for (const point of points) {
      const key = `${Math.floor(point[0] / latStep)}_${Math.floor(point[1] / lngStepAt(point[0]))}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(point);
      else grid.set(key, [point]);
    }
  }

  function isNear([lat, lng]: Point, thresholdMeters = DEFAULT_THRESHOLD_METERS) {
    const latCell = Math.floor(lat / latStep);
    const lngCell = Math.floor(lng / lngStepAt(lat));
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLng = -1; dLng <= 1; dLng++) {
        const bucket = grid.get(`${latCell + dLat}_${lngCell + dLng}`);
        if (!bucket) continue;
        for (const point of bucket) {
          if (haversine([lat, lng], point) <= thresholdMeters) return true;
        }
      }
    }
    return false;
  }

  return { isNear };
}

export function newRoadPercentage(
  routePoints: Point[],
  index: ActivityIndex,
  thresholdMeters = DEFAULT_THRESHOLD_METERS
) {
  if (routePoints.length < 2) return null;

  let totalLength = 0;
  let newLength = 0;
  for (let i = 0; i < routePoints.length - 1; i++) {
    const a = routePoints[i];
    const b = routePoints[i + 1];
    const segmentLength = haversine(a, b);
    if (segmentLength === 0) continue;
    const midpoint: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    totalLength += segmentLength;
    if (!index.isNear(midpoint, thresholdMeters)) newLength += segmentLength;
  }

  if (totalLength === 0) return null;
  return Math.round((newLength / totalLength) * 100);
}
