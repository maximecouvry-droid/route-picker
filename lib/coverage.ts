const EARTH_RADIUS = 6371000;
// Grid resolution is only a broad-phase lookup and is independent from the
// matching threshold: isNear() widens its neighbor search to cover whatever
// threshold it's given, and distances are computed exactly (point-to-segment,
// not point-to-point), so this can stay coarse without losing precision.
const CELL_SIZE_METERS = 50;
const DEFAULT_THRESHOLD_METERS = 75;
// Only the route side is densified (a route is short); activities are
// indexed as exact line segments so precision isn't limited by sample
// spacing, and memory stays bounded regardless of total ridden distance.
const ROUTE_SAMPLE_STEP_METERS = 5;

type Point = [number, number];
type Segment = { a: Point; b: Point };

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

// Equirectangular projection around `origin` is accurate to well under a
// meter at the threshold scales used here, and is much cheaper than exact
// great-circle point-to-segment math.
function projectMeters(point: Point, origin: Point): [number, number] {
  const x = toRad(point[1] - origin[1]) * 111320 * Math.cos(toRad(origin[0]));
  const y = toRad(point[0] - origin[0]) * 111320;
  return [x, y];
}

function pointToSegmentMeters(p: Point, a: Point, b: Point): number {
  const P = projectMeters(p, a);
  const B = projectMeters(b, a);
  const abx = B[0];
  const aby = B[1];
  const apx = P[0];
  const apy = P[1];
  const lenSq = abx * abx + aby * aby;
  let t = lenSq === 0 ? 0 : (apx * abx + apy * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = abx * t;
  const cy = aby * t;
  const dx = P[0] - cx;
  const dy = P[1] - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

function densify(points: Point[], maxSegmentMeters: number): Point[] {
  if (points.length < 2) return points;
  const result: Point[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dist = haversine(a, b);
    if (dist === 0) continue;
    const steps = Math.max(1, Math.ceil(dist / maxSegmentMeters));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}

function lngStepAt(lat: number) {
  return CELL_SIZE_METERS / (111320 * Math.max(Math.cos(toRad(lat)), 0.1));
}

const latStep = CELL_SIZE_METERS / 111320;

function cellKey(lat: number, lng: number) {
  return `${Math.floor(lat / latStep)}_${Math.floor(lng / lngStepAt(lat))}`;
}

function cellsForSegment(a: Point, b: Point): string[] {
  const dist = haversine(a, b);
  const steps = Math.max(1, Math.ceil(dist / (CELL_SIZE_METERS / 2)));
  const keys = new Set<string>();
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    keys.add(cellKey(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
  }
  return [...keys];
}

export type ActivityIndex = {
  isNear: (point: Point, thresholdMeters?: number) => boolean;
};

export function buildActivityIndex(activityPointSets: Point[][]): ActivityIndex {
  const grid = new Map<string, Segment[]>();

  for (const points of activityPointSets) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (haversine(a, b) === 0) continue;
      const segment: Segment = { a, b };
      for (const key of cellsForSegment(a, b)) {
        const bucket = grid.get(key);
        if (bucket) bucket.push(segment);
        else grid.set(key, [segment]);
      }
    }
  }

  function isNear(point: Point, thresholdMeters = DEFAULT_THRESHOLD_METERS) {
    const latCell = Math.floor(point[0] / latStep);
    const lngCell = Math.floor(point[1] / lngStepAt(point[0]));
    const cellRadius = Math.max(1, Math.ceil(thresholdMeters / CELL_SIZE_METERS));
    const seen = new Set<Segment>();
    for (let dLat = -cellRadius; dLat <= cellRadius; dLat++) {
      for (let dLng = -cellRadius; dLng <= cellRadius; dLng++) {
        const bucket = grid.get(`${latCell + dLat}_${lngCell + dLng}`);
        if (!bucket) continue;
        for (const segment of bucket) {
          if (seen.has(segment)) continue;
          seen.add(segment);
          if (pointToSegmentMeters(point, segment.a, segment.b) <= thresholdMeters) return true;
        }
      }
    }
    return false;
  }

  return { isNear };
}

export type CoverageSegment = { a: Point; b: Point; isNew: boolean };

// Classifies each ~5m slice of the route so the result can be drawn on the
// map (green = already ridden, red = new) to visually cross-check the
// aggregate percentage against the heatmap.
export function routeCoverageSegments(
  rawRoutePoints: Point[],
  index: ActivityIndex,
  thresholdMeters = DEFAULT_THRESHOLD_METERS
): CoverageSegment[] {
  if (rawRoutePoints.length < 2) return [];
  const routePoints = densify(rawRoutePoints, ROUTE_SAMPLE_STEP_METERS);

  const segments: CoverageSegment[] = [];
  for (let i = 0; i < routePoints.length - 1; i++) {
    const a = routePoints[i];
    const b = routePoints[i + 1];
    if (haversine(a, b) === 0) continue;
    const midpoint: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    segments.push({ a, b, isNew: !index.isNear(midpoint, thresholdMeters) });
  }
  return segments;
}

export function newRoadPercentage(
  rawRoutePoints: Point[],
  index: ActivityIndex,
  thresholdMeters = DEFAULT_THRESHOLD_METERS
) {
  const segments = routeCoverageSegments(rawRoutePoints, index, thresholdMeters);
  if (segments.length === 0) return null;

  let totalLength = 0;
  let newLength = 0;
  for (const segment of segments) {
    const length = haversine(segment.a, segment.b);
    totalLength += length;
    if (segment.isNew) newLength += length;
  }

  if (totalLength === 0) return null;
  return Math.round((newLength / totalLength) * 100);
}
