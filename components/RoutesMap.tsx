"use client";

import { useMemo } from "react";
import { MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";
import type { LatLngBounds } from "leaflet";
import type { ActivityItem, RouteItem } from "@/lib/types";
import { decodePolyline } from "@/lib/polyline";
import type { CoverageSegment } from "@/lib/coverage";
import FitBounds from "@/components/FitBounds";
import MapBoundsWatcher from "@/components/MapBoundsWatcher";

// Merges consecutive same-classification segments into single polylines so
// a 50km route doesn't turn into thousands of individual SVG paths.
function mergeCoverageRuns(segments: CoverageSegment[]) {
  const runs: { points: [number, number][]; isNew: boolean }[] = [];
  for (const segment of segments) {
    const last = runs[runs.length - 1];
    if (last && last.isNew === segment.isNew) {
      last.points.push(segment.b);
    } else {
      runs.push({ points: [segment.a, segment.b], isNew: segment.isNew });
    }
  }
  return runs;
}

export default function RoutesMap({
  routes,
  selectedId,
  onSelect,
  heatmapActivities = [],
  heatmapOpacity = 0.18,
  selectedCoverageSegments = [],
  onBoundsChange,
  fitPoints
}: {
  routes: RouteItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  heatmapActivities?: ActivityItem[];
  heatmapOpacity?: number;
  selectedCoverageSegments?: CoverageSegment[];
  onBoundsChange?: (bounds: LatLngBounds) => void;
  // Points used to auto-fit the view. Deliberately separate from `routes`
  // (which is already narrowed by sidebar/map filters): fitting to the
  // filtered set would snap the zoom back out every time a filter changes.
  // Pass the unfiltered dataset's decoded points so this only fires when
  // new data actually loads.
  fitPoints?: [number, number][];
}) {
  const coverageRuns = useMemo(
    () => mergeCoverageRuns(selectedCoverageSegments),
    [selectedCoverageSegments]
  );
  const decoded = useMemo(
    () => routes
      .map((route) => ({
        route,
        points: decodePolyline(route.map?.summary_polyline || route.map?.polyline || "")
      }))
      .filter((item) => item.points.length > 1),
    [routes]
  );

  const decodedActivities = useMemo(
    () => heatmapActivities
      .map((activity) => ({
        id: activity.id,
        points: decodePolyline(activity.map?.summary_polyline || "")
      }))
      .filter((item) => item.points.length > 1),
    [heatmapActivities]
  );

  const allPoints = useMemo(() => decoded.flatMap((item) => item.points), [decoded]);

  return (
    <MapContainer center={[45.764, 4.8357]} zoom={9} className="map">
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={fitPoints ?? allPoints} />
      {onBoundsChange && <MapBoundsWatcher onChange={onBoundsChange} />}
      {decodedActivities.map(({ id, points }) => (
        <Polyline
          key={`activity-${id}`}
          positions={points}
          pathOptions={{ color: "#1e78d6", weight: 2, opacity: heatmapOpacity }}
          interactive={false}
        />
      ))}
      {decoded.map(({ route, points }) => (
        <Polyline
          key={route.id}
          positions={points}
          pathOptions={{
            color: route.id === selectedId ? "#fc5200" : "#252525",
            weight: route.id === selectedId ? 9 : 5,
            opacity: route.id === selectedId ? 1 : 0.5
          }}
          eventHandlers={{ click: () => onSelect(route.id) }}
        >
          <Tooltip sticky>
            <strong>{route.name}</strong><br />
            {(route.distance / 1000).toFixed(1)} km · {Math.round(route.elevation_gain)} m D+
          </Tooltip>
        </Polyline>
      ))}
      {coverageRuns.map((run, i) => (
        <Polyline
          key={`cov-${i}`}
          positions={run.points}
          pathOptions={{ color: run.isNew ? "#e0402a" : "#1e8a4c", weight: 5, opacity: 0.95 }}
          interactive={false}
        />
      ))}
    </MapContainer>
  );
}
