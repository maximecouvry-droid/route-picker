export type RouteItem = {
  id: string;
  name: string;
  description: string;
  distance: number;
  elevation_gain: number;
  type: number;
  sub_type: number;
  private: boolean;
  created_at: string;
  updated_at: string;
  map: {
    id?: string;
    summary_polyline?: string;
    polyline?: string;
  };
};
