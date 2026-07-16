"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LatLngBounds } from "leaflet";
import type { ActivityItem, RouteItem } from "@/lib/types";
import { decodePolyline } from "@/lib/polyline";
import { buildActivityIndex, newRoadPercentage, routeCoverageSegments, type ActivityIndex } from "@/lib/coverage";

const RoutesMap = dynamic(() => import("@/components/RoutesMap"), {
  ssr: false,
  loading: () => <div className="mapLoading">Chargement de la carte…</div>
});

const ActivitiesMap = dynamic(() => import("@/components/ActivitiesMap"), {
  ssr: false,
  loading: () => <div className="mapLoading">Chargement de la carte…</div>
});

type SortKey = "near" | "distance" | "elevation" | "name" | "newRoads";
type ActivitySortKey = "date" | "distance" | "elevation" | "duration";
type View = "routes" | "activities";

const SPORT_LABELS: Record<string, string> = {
  Ride: "Route",
  GravelRide: "Gravel",
  MountainBikeRide: "VTT",
  EBikeRide: "VAE",
  Handcycle: "Handbike",
  Velomobile: "Vélomobile",
  Run: "Course à pied",
  TrailRun: "Trail"
};

const km = (meters: number) => Math.round(meters / 100) / 10;
const rounded = (value: number) => Math.round(value);
const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
};
const formatDate = (isoDate: string) => isoDate.slice(0, 10).split("-").reverse().join("/");

// Fraction (0-1) of a polyline's length that falls inside `bounds`, used to
// let the map viewport act as a filter on the list. Plain degree-space
// distance is fine here since it's only used as a relative length weight
// over a single route's small extent.
function visibleFraction(points: [number, number][], bounds: LatLngBounds | null): number {
  if (!bounds || points.length < 2) return 1;
  let total = 0;
  let visible = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const midpoint: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    total += length;
    if (bounds.contains(midpoint)) visible += length;
  }
  return total === 0 ? 1 : visible / total;
}

export default function Home() {
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [minDistance, setMinDistance] = useState(0);
  const [maxDistance, setMaxDistance] = useState(250);
  const [maxElevation, setMaxElevation] = useState(5000);
  const [sort, setSort] = useState<SortKey>("distance");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [coverage, setCoverage] = useState<Record<string, number | null>>({});
  const [computingCoverage, setComputingCoverage] = useState(false);
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.18);
  const [yearRange, setYearRange] = useState<[number, number]>([0, 0]);
  const activityIndexRef = useRef<ActivityIndex | null>(null);

  const [view, setView] = useState<View>("routes");
  const [actSelectedId, setActSelectedId] = useState<string | null>(null);
  const [sportFilter, setSportFilter] = useState("all");
  const [actMinDistance, setActMinDistance] = useState(0);
  const [actMaxDistance, setActMaxDistance] = useState(250);
  const [actMinDuration, setActMinDuration] = useState(0);
  const [actMaxDuration, setActMaxDuration] = useState(600);
  const [actMaxElevation, setActMaxElevation] = useState(5000);
  const [actDateFrom, setActDateFrom] = useState("");
  const [actDateTo, setActDateTo] = useState("");
  const [actSort, setActSort] = useState<ActivitySortKey>("distance");

  const [filterByMap, setFilterByMap] = useState(false);
  const [mapVisibilityThreshold, setMapVisibilityThreshold] = useState(30);
  const [routeMapBounds, setRouteMapBounds] = useState<LatLngBounds | null>(null);
  const [actMapBounds, setActMapBounds] = useState<LatLngBounds | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("route-picker-routes");
    const savedFavs = localStorage.getItem("route-picker-favorites");
    const savedActivities = localStorage.getItem("route-picker-activities");
    if (saved) {
      try { setRoutes(JSON.parse(saved)); } catch {}
    }
    if (savedFavs) {
      try { setFavorites(JSON.parse(savedFavs)); } catch {}
    }
    if (savedActivities) {
      try { setActivities(JSON.parse(savedActivities)); } catch {}
    }
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((data) => setConnected(Boolean(data.connected)))
      .catch(() => setConnected(false));
  }, []);

  async function refreshRoutes() {
    setLoading(true);
    try {
      const response = await fetch("/api/routes", { cache: "no-store" });
      if (response.status === 401) {
        setConnected(false);
        return;
      }
      if (!response.ok) throw new Error("Impossible de récupérer les itinéraires.");
      const data = await response.json();
      setRoutes(data.routes);
      localStorage.setItem("route-picker-routes", JSON.stringify(data.routes));
      setConnected(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  async function loadActivities() {
    setLoadingActivities(true);
    try {
      const response = await fetch("/api/activities", { cache: "no-store" });
      if (response.status === 401) {
        setConnected(false);
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossible de récupérer les sorties.");
      setActivities(data.activities);
      try {
        localStorage.setItem("route-picker-activities", JSON.stringify(data.activities));
      } catch {
        // Quota exceeded (large history): keep working for this session,
        // it just won't survive a reload without re-fetching from Strava.
        alert("Trop de sorties pour être mises en cache localement : elles resteront chargées pour cette session, mais il faudra recliquer sur « Charger mes sorties » après un rechargement de page.");
      }
      setShowHeatmap(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setLoadingActivities(false);
    }
  }

  function computeCoverage() {
    if (activities.length === 0) {
      alert("Charge d'abord tes sorties pour calculer la nouveauté des itinéraires.");
      return;
    }
    setComputingCoverage(true);
    setTimeout(() => {
      const activityPointSets = activities
        .map((activity) => decodePolyline(activity.map?.summary_polyline || ""))
        .filter((points) => points.length > 1);
      const index = buildActivityIndex(activityPointSets);
      activityIndexRef.current = index;

      const next: Record<string, number | null> = {};
      for (const route of routes) {
        const points = decodePolyline(route.map?.summary_polyline || route.map?.polyline || "");
        next[route.id] = newRoadPercentage(points, index);
      }
      setCoverage(next);
      setComputingCoverage(false);
    }, 10);
  }

  async function disconnect() {
    await fetch("/api/auth/logout", { method: "POST" });
    setConnected(false);
  }

  function toggleFavorite(id: string) {
    const next = favorites.includes(id)
      ? favorites.filter((routeId) => routeId !== id)
      : [...favorites, id];
    setFavorites(next);
    localStorage.setItem("route-picker-favorites", JSON.stringify(next));
  }

  const activitiesByYear = useMemo(() => {
    const counts = new Map<string, number>();
    for (const activity of activities) {
      const year = activity.start_date.slice(0, 4);
      counts.set(year, (counts.get(year) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [activities]);

  const yearBounds = useMemo<[number, number]>(() => {
    if (activities.length === 0) {
      const current = new Date().getFullYear();
      return [current, current];
    }
    const years = activities.map((activity) => Number(activity.start_date.slice(0, 4)));
    return [Math.min(...years), Math.max(...years)];
  }, [activities]);

  useEffect(() => {
    setYearRange(yearBounds);
  }, [yearBounds[0], yearBounds[1]]);

  const heatmapActivities = useMemo(() => {
    if (!showHeatmap) return [];
    return activities.filter((activity) => {
      const year = Number(activity.start_date.slice(0, 4));
      return year >= yearRange[0] && year <= yearRange[1];
    });
  }, [activities, showHeatmap, yearRange]);

  const filteredRoutes = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return routes
      .filter((route) => !lowerQuery || route.name.toLowerCase().includes(lowerQuery))
      .filter((route) => km(route.distance) >= minDistance && km(route.distance) <= maxDistance)
      .filter((route) => route.elevation_gain <= maxElevation)
      .filter((route) => !showFavorites || favorites.includes(route.id))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "elevation") return a.elevation_gain - b.elevation_gain;
        if (sort === "newRoads") return (coverage[b.id] ?? -1) - (coverage[a.id] ?? -1);
        return a.distance - b.distance;
      });
  }, [routes, query, minDistance, maxDistance, maxElevation, sort, showFavorites, favorites, coverage]);

  const selected = filteredRoutes.find((route) => route.id === selectedId) ?? null;

  const selectedCoverageSegments = useMemo(() => {
    if (!selected || !activityIndexRef.current || coverage[selected.id] == null) return [];
    const points = decodePolyline(selected.map?.summary_polyline || selected.map?.polyline || "");
    return routeCoverageSegments(points, activityIndexRef.current);
  }, [selected, coverage]);

  const sportOptions = useMemo(
    () => [...new Set(activities.map((activity) => activity.sport_type))].sort(),
    [activities]
  );

  const filteredActivities = useMemo(() => {
    return activities
      .filter((activity) => sportFilter === "all" || activity.sport_type === sportFilter)
      .filter((activity) => km(activity.distance) >= actMinDistance && km(activity.distance) <= actMaxDistance)
      .filter((activity) => activity.moving_time / 60 >= actMinDuration && activity.moving_time / 60 <= actMaxDuration)
      .filter((activity) => activity.total_elevation_gain <= actMaxElevation)
      .filter((activity) => !actDateFrom || activity.start_date.slice(0, 10) >= actDateFrom)
      .filter((activity) => !actDateTo || activity.start_date.slice(0, 10) <= actDateTo)
      .sort((a, b) => {
        if (actSort === "elevation") return a.total_elevation_gain - b.total_elevation_gain;
        if (actSort === "duration") return a.moving_time - b.moving_time;
        if (actSort === "date") return b.start_date.localeCompare(a.start_date);
        return a.distance - b.distance;
      });
  }, [activities, sportFilter, actMinDistance, actMaxDistance, actMinDuration, actMaxDuration, actMaxElevation, actDateFrom, actDateTo, actSort]);

  const actSelected = filteredActivities.find((activity) => activity.id === actSelectedId) ?? null;

  const visibleRoutes = useMemo(() => {
    if (!filterByMap || !routeMapBounds) return filteredRoutes;
    return filteredRoutes.filter((route) => {
      const points = decodePolyline(route.map?.summary_polyline || route.map?.polyline || "");
      return visibleFraction(points, routeMapBounds) * 100 >= mapVisibilityThreshold;
    });
  }, [filteredRoutes, filterByMap, routeMapBounds, mapVisibilityThreshold]);

  const visibleActivities = useMemo(() => {
    if (!filterByMap || !actMapBounds) return filteredActivities;
    return filteredActivities.filter((activity) => {
      const points = decodePolyline(activity.map?.summary_polyline || "");
      return visibleFraction(points, actMapBounds) * 100 >= mapVisibilityThreshold;
    });
  }, [filteredActivities, filterByMap, actMapBounds, mapVisibilityThreshold]);

  return (
    <main>
      <header className="topbar">
        <div>
          <h1 className="brandTitle">Route Picker</h1>
        </div>
        <div className="headerActions">
          <button className="ghost" onClick={() => setShowSettings(true)}>Réglages</button>
          {connected ? (
            <>
              <button className="secondary" onClick={refreshRoutes} disabled={loading}>
                {loading ? "Synchronisation…" : "Actualiser"}
              </button>
              <button className="ghost" onClick={disconnect}>Déconnecter</button>
            </>
          ) : (
            <a className="stravaButton" href="/api/auth/login">Se connecter avec Strava</a>
          )}
        </div>
      </header>

      {showSettings && (
        <div className="modalOverlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h2>Réglages</h2>
              <button className="ghost" onClick={() => setShowSettings(false)}>Fermer</button>
            </div>
            <div className="modalBody">
              <h3>Séances importées par année</h3>
              {activitiesByYear.length === 0 ? (
                <p className="empty">
                  Aucune séance importée. Clique sur « Charger mes sorties » dans le footer Heatmap.
                </p>
              ) : (
                <ul className="yearList">
                  {activitiesByYear.map(([year, count]) => (
                    <li key={year}>
                      <span>{year}</span>
                      <strong>{count}</strong>
                    </li>
                  ))}
                  <li className="yearTotal">
                    <span>Total</span>
                    <strong>{activities.length}</strong>
                  </li>
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="tabBar">
        <button
          className={`tabButton ${view === "routes" ? "tabButtonActive" : ""}`}
          onClick={() => setView("routes")}
        >
          Itinéraires
        </button>
        <button
          className={`tabButton ${view === "activities" ? "tabButtonActive" : ""}`}
          onClick={() => setView("activities")}
        >
          Mes sorties
        </button>
      </div>

      {view === "routes" && (
        <>
          <div className="filterBar">
            <label className="fbField">
              <span>Rechercher</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Beaujolais, Chartreuse…"
              />
            </label>
            <label className="fbField fbSmall">
              <span>Distance min.</span>
              <input type="number" min="0" value={minDistance}
                onChange={(e) => setMinDistance(Number(e.target.value))} />
            </label>
            <label className="fbField fbSmall">
              <span>Distance max.</span>
              <input type="number" min="0" value={maxDistance}
                onChange={(e) => setMaxDistance(Number(e.target.value))} />
            </label>
            <label className="fbField fbSmall">
              <span>Dénivelé max.</span>
              <input type="number" min="0" step="100" value={maxElevation}
                onChange={(e) => setMaxElevation(Number(e.target.value))} />
            </label>
            <label className="fbField fbSmall">
              <span>Trier par</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="distance">Distance</option>
                <option value="elevation">Dénivelé</option>
                <option value="name">Nom</option>
                <option value="newRoads">% routes nouvelles</option>
              </select>
            </label>
            <label className="fbField fbCheck checkLabel">
              <input type="checkbox" checked={showFavorites}
                onChange={(e) => setShowFavorites(e.target.checked)} />
              Mes favoris
            </label>
            <label className="fbField fbCheck checkLabel">
              <input type="checkbox" checked={filterByMap}
                onChange={(e) => setFilterByMap(e.target.checked)} />
              Filtrer selon la carte
            </label>
            {filterByMap && (
              <label className="rangeField">
                <span>Visible mini. {mapVisibilityThreshold}%</span>
                <input type="range" min="0" max="100" step="10" value={mapVisibilityThreshold}
                  onChange={(e) => setMapVisibilityThreshold(Number(e.target.value))} />
              </label>
            )}
          </div>

          <section className="workspace">
            <aside className="panel">
              <div className="sectionBar">
                Itinéraires
                <span className="sectionBarCount">{visibleRoutes.length}</span>
              </div>

              <div className="routeList">
                {visibleRoutes.map((route) => (
                  <article
                    key={route.id}
                    className={`routeCard ${selectedId === route.id ? "selected" : ""}`}
                    onClick={() => setSelectedId(route.id)}
                  >
                    <button
                      className={`favorite ${favorites.includes(route.id) ? "active" : ""}`}
                      aria-label="Ajouter aux favoris de l'application"
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(route.id); }}
                    >
                      ★
                    </button>
                    <h2>{route.name}</h2>
                    <div className="stats">
                      <span>{km(route.distance)} km</span>
                      <span>{rounded(route.elevation_gain)} m D+</span>
                      {coverage[route.id] != null && (
                        <span className="newBadge">{coverage[route.id]}% nouveau</span>
                      )}
                    </div>
                    {route.description && <p>{route.description}</p>}
                  </article>
                ))}
                {!connected && routes.length === 0 && (
                  <div className="empty">
                    Connecte ton compte Strava pour charger tes itinéraires.
                  </div>
                )}
                {connected && routes.length === 0 && (
                  <div className="empty">
                    Clique sur « Actualiser » pour importer tes itinéraires.
                  </div>
                )}
                {routes.length > 0 && filteredRoutes.length > 0 && visibleRoutes.length === 0 && (
                  <div className="empty">
                    Aucun itinéraire suffisamment visible dans la zone de la carte affichée.
                  </div>
                )}
              </div>
            </aside>

            <section className="mapArea">
              <RoutesMap
                routes={filteredRoutes}
                selectedId={selectedId}
                onSelect={setSelectedId}
                heatmapActivities={heatmapActivities}
                heatmapOpacity={heatmapOpacity}
                selectedCoverageSegments={selectedCoverageSegments}
                onBoundsChange={filterByMap ? setRouteMapBounds : undefined}
              />
              {selected && (
                <div className="selectedRoute">
                  <div>
                    <strong>{selected.name}</strong>
                    <span>
                      {km(selected.distance)} km · {rounded(selected.elevation_gain)} m D+
                      {coverage[selected.id] != null && ` · ${coverage[selected.id]}% nouveau`}
                    </span>
                    {coverage[selected.id] != null && (
                      <span className="coverageLegend">
                        <i className="legendDot legendDotKnown" /> déjà roulé
                        <i className="legendDot legendDotNew" /> nouveau
                      </span>
                    )}
                  </div>
                  <a
                    href={`https://www.strava.com/routes/${selected.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Strava
                  </a>
                </div>
              )}
            </section>
          </section>

          <footer className="heatmapBar">
            <div className="sectionBar sectionBarInline">Heatmap</div>
            <label className="checkLabel">
              <input type="checkbox" checked={showHeatmap} disabled={activities.length === 0}
                onChange={(e) => setShowHeatmap(e.target.checked)} />
              Afficher
            </label>
            <button className="secondary" onClick={loadActivities} disabled={loadingActivities}>
              {loadingActivities ? "Import…" : activities.length ? `Actualiser mes sorties (${activities.length})` : "Charger mes sorties"}
            </button>
            <label className="rangeField">
              <span>Intensité</span>
              <input type="range" min="0.05" max="0.6" step="0.01" value={heatmapOpacity}
                onChange={(e) => setHeatmapOpacity(Number(e.target.value))} />
            </label>
            {activities.length > 0 && (
              <>
                <label className="rangeField">
                  <span>Depuis {yearRange[0]}</span>
                  <input type="range" min={yearBounds[0]} max={yearBounds[1]} value={yearRange[0]}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setYearRange((prev) => [Math.min(value, prev[1]), prev[1]]);
                    }} />
                </label>
                <label className="rangeField">
                  <span>Jusqu&apos;à {yearRange[1]}</span>
                  <input type="range" min={yearBounds[0]} max={yearBounds[1]} value={yearRange[1]}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setYearRange((prev) => [prev[0], Math.max(value, prev[0])]);
                    }} />
                </label>
              </>
            )}
            <button className="accent" onClick={computeCoverage} disabled={computingCoverage || activities.length === 0}>
              {computingCoverage ? "Calcul…" : "Calculer les routes nouvelles"}
            </button>
          </footer>
        </>
      )}

      {view === "activities" && (
        <>
          <div className="filterBar">
            <label className="fbField fbSmall">
              <span>Sport</span>
              <select value={sportFilter} onChange={(e) => setSportFilter(e.target.value)}>
                <option value="all">Tous</option>
                {sportOptions.map((sport) => (
                  <option key={sport} value={sport}>{SPORT_LABELS[sport] || sport}</option>
                ))}
              </select>
            </label>
            <label className="fbField fbSmall">
              <span>Distance min.</span>
              <input type="number" min="0" value={actMinDistance}
                onChange={(e) => setActMinDistance(Number(e.target.value))} />
            </label>
            <label className="fbField fbSmall">
              <span>Distance max.</span>
              <input type="number" min="0" value={actMaxDistance}
                onChange={(e) => setActMaxDistance(Number(e.target.value))} />
            </label>
            <label className="fbField fbSmall">
              <span>Durée min. (min)</span>
              <input type="number" min="0" step="10" value={actMinDuration}
                onChange={(e) => setActMinDuration(Number(e.target.value))} />
            </label>
            <label className="fbField fbSmall">
              <span>Durée max. (min)</span>
              <input type="number" min="0" step="10" value={actMaxDuration}
                onChange={(e) => setActMaxDuration(Number(e.target.value))} />
            </label>
            <label className="fbField fbSmall">
              <span>Dénivelé max.</span>
              <input type="number" min="0" step="100" value={actMaxElevation}
                onChange={(e) => setActMaxElevation(Number(e.target.value))} />
            </label>
            <label className="fbField fbSmall">
              <span>Depuis le</span>
              <input type="date" value={actDateFrom}
                onChange={(e) => setActDateFrom(e.target.value)} />
            </label>
            <label className="fbField fbSmall">
              <span>Jusqu&apos;au</span>
              <input type="date" value={actDateTo}
                onChange={(e) => setActDateTo(e.target.value)} />
            </label>
            <label className="fbField fbSmall">
              <span>Trier par</span>
              <select value={actSort} onChange={(e) => setActSort(e.target.value as ActivitySortKey)}>
                <option value="distance">Distance</option>
                <option value="elevation">Dénivelé</option>
                <option value="duration">Durée</option>
                <option value="date">Date</option>
              </select>
            </label>
            <label className="fbField fbCheck checkLabel">
              <input type="checkbox" checked={filterByMap}
                onChange={(e) => setFilterByMap(e.target.checked)} />
              Filtrer selon la carte
            </label>
            {filterByMap && (
              <label className="rangeField">
                <span>Visible mini. {mapVisibilityThreshold}%</span>
                <input type="range" min="0" max="100" step="10" value={mapVisibilityThreshold}
                  onChange={(e) => setMapVisibilityThreshold(Number(e.target.value))} />
              </label>
            )}
          </div>

          <section className="workspace">
            <aside className="panel">
              <div className="sectionBar">
                Mes sorties
                <span className="sectionBarCount">{visibleActivities.length}</span>
              </div>

              <div className="routeList">
                {visibleActivities.map((activity) => (
                  <article
                    key={activity.id}
                    className={`routeCard ${actSelectedId === activity.id ? "selected" : ""}`}
                    onClick={() => setActSelectedId(activity.id)}
                  >
                    <h2>{activity.name}</h2>
                    <div className="stats">
                      <span>{km(activity.distance)} km</span>
                      <span>{rounded(activity.total_elevation_gain)} m D+</span>
                      <span>{formatDuration(activity.moving_time)}</span>
                      <span>{formatDate(activity.start_date)}</span>
                    </div>
                  </article>
                ))}
                {activities.length === 0 && (
                  <div className="empty">
                    Charge tes sorties depuis l&apos;onglet « Itinéraires » (footer Heatmap) pour les retrouver ici.
                  </div>
                )}
                {activities.length > 0 && filteredActivities.length === 0 && (
                  <div className="empty">
                    Aucune sortie ne correspond à ces filtres.
                  </div>
                )}
                {filteredActivities.length > 0 && visibleActivities.length === 0 && (
                  <div className="empty">
                    Aucune sortie suffisamment visible dans la zone de la carte affichée.
                  </div>
                )}
              </div>
            </aside>

            <section className="mapArea">
              <ActivitiesMap
                activities={filteredActivities}
                selectedId={actSelectedId}
                onSelect={setActSelectedId}
                onBoundsChange={filterByMap ? setActMapBounds : undefined}
              />
              {actSelected && (
                <div className="selectedRoute">
                  <div>
                    <strong>{actSelected.name}</strong>
                    <span>
                      {km(actSelected.distance)} km · {rounded(actSelected.total_elevation_gain)} m D+ ·{" "}
                      {formatDuration(actSelected.moving_time)} · {formatDate(actSelected.start_date)}
                    </span>
                  </div>
                  <a
                    href={`https://www.strava.com/activities/${actSelected.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Strava
                  </a>
                </div>
              )}
            </section>
          </section>
        </>
      )}
    </main>
  );
}
