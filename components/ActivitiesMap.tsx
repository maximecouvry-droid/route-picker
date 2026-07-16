"use client";

import { useMemo } from "react";
import { MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";
import type { LatLngBounds } from "leaflet";
import type { ActivityItem } from "@/lib/types";
import { decodePolyline } from "@/lib/polyline";
import FitBounds from "@/components/FitBounds";
import MapBoundsWatcher from "@/components/MapBoundsWatcher";

export default function ActivitiesMap({
  activities,
  selectedId,
  onSelect,
  onBoundsChange,
  fitPoints
}: {
  activities: ActivityItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBoundsChange?: (bounds: LatLngBounds) => void;
  fitPoints?: [number, number][];
}) {
  const decoded = useMemo(
    () => activities
      .map((activity) => ({
        activity,
        points: decodePolyline(activity.map?.summary_polyline || "")
      }))
      .filter((item) => item.points.length > 1),
    [activities]
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
      {decoded.map(({ activity, points }) => (
        <Polyline
          key={activity.id}
          positions={points}
          pathOptions={{
            color: activity.id === selectedId ? "#fc5200" : "#1e78d6",
            weight: activity.id === selectedId ? 9 : 4,
            opacity: activity.id === selectedId ? 1 : 0.45
          }}
          eventHandlers={{ click: () => onSelect(activity.id) }}
        >
          <Tooltip sticky>
            <strong>{activity.name}</strong><br />
            {(activity.distance / 1000).toFixed(1)} km · {Math.round(activity.total_elevation_gain)} m D+
          </Tooltip>
        </Polyline>
      ))}
    </MapContainer>
  );
}
