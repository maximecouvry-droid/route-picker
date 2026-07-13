"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import type { ActivityItem, RouteItem } from "@/lib/types";
import { decodePolyline } from "@/lib/polyline";

function FitBounds({ points }: { points: LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points as LatLngBoundsExpression, { padding: [24, 24] });
    }
  }, [map, points]);
  return null;
}

export default function RoutesMap({
  routes,
  selectedId,
  onSelect,
  heatmapActivities = [],
  heatmapOpacity = 0.18
}: {
  routes: RouteItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  heatmapActivities?: ActivityItem[];
  heatmapOpacity?: number;
}) {
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
      <FitBounds points={allPoints} />
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
            weight: route.id === selectedId ? 6 : 3,
            opacity: route.id === selectedId ? 1 : 0.42
          }}
          eventHandlers={{ click: () => onSelect(route.id) }}
        >
          <Tooltip sticky>
            <strong>{route.name}</strong><br />
            {(route.distance / 1000).toFixed(1)} km · {Math.round(route.elevation_gain)} m D+
          </Tooltip>
        </Polyline>
      ))}
    </MapContainer>
  );
}
