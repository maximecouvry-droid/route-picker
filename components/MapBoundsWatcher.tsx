"use client";

import { useMapEvents } from "react-leaflet";
import type { LatLngBounds } from "leaflet";

export default function MapBoundsWatcher({ onChange }: { onChange: (bounds: LatLngBounds) => void }) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds()),
    zoomend: () => onChange(map.getBounds())
  });
  return null;
}
