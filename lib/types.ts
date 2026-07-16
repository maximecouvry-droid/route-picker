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

export type ActivityItem = {
  id: string;
  name: string;
  distance: number;
  total_elevation_gain: number;
  moving_time: number;
  sport_type: string;
  start_date: string;
  map: {
    id?: string;
    summary_polyline?: string;
  };
};
