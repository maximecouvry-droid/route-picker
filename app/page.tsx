"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { ActivityItem, RouteItem } from "@/lib/types";
import { decodePolyline } from "@/lib/polyline";
import { buildActivityIndex, newRoadPercentage } from "@/lib/coverage";

const RoutesMap = dynamic(() => import("@/components/RoutesMap"), {
  ssr: false,
  loading: () => <div className="mapLoading">Chargement de la carte…</div>
});

type SortKey = "near" | "distance" | "elevation" | "name" | "newRoads";

const km = (meters: number) => Math.round(meters / 100) / 10;
const rounded = (value: number) => Math.round(value);

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
      if (!response.ok) throw new Error(data.error || "Impossible de récupérer les sorties vélo.");
      setActivities(data.activities);
      localStorage.setItem("route-picker-activities", JSON.stringify(data.activities));
      setShowHeatmap(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setLoadingActivities(false);
    }
  }

  function computeCoverage() {
    if (activities.length === 0) {
      alert("Charge d'abord tes sorties vélo pour calculer la nouveauté des itinéraires.");
      return;
    }
    setComputingCoverage(true);
    setTimeout(() => {
      const activityPointSets = activities
        .map((activity) => decodePolyline(activity.map?.summary_polyline || ""))
        .filter((points) => points.length > 1);
      const index = buildActivityIndex(activityPointSets);

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

  return (
    <main>
      <header className="topbar">
        <div>
          <div className="eyebrow">ROUTE PICKER</div>
          <h1>Trouve le bon parcours, sans fouiller dans Strava.</h1>
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
            <h3>Séances vélo importées par année</h3>
            {activitiesByYear.length === 0 ? (
              <p className="empty">
                Aucune séance importée. Clique sur « Charger mes sorties vélo » dans les filtres.
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
      )}

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
      </div>

      <section className="workspace">
        <aside className="panel">
          <div className="count">
            <strong>{filteredRoutes.length}</strong> itinéraire{filteredRoutes.length > 1 ? "s" : ""}
          </div>

          <div className="routeList">
            {filteredRoutes.map((route) => (
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
          </div>
        </aside>

        <section className="mapArea">
          <RoutesMap
            routes={filteredRoutes}
            selectedId={selectedId}
            onSelect={setSelectedId}
            heatmapActivities={heatmapActivities}
            heatmapOpacity={heatmapOpacity}
          />
          {selected && (
            <div className="selectedRoute">
              <div>
                <strong>{selected.name}</strong>
                <span>
                  {km(selected.distance)} km · {rounded(selected.elevation_gain)} m D+
                  {coverage[selected.id] != null && ` · ${coverage[selected.id]}% nouveau`}
                </span>
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
        <div className="heatmapBarLabel">Heatmap</div>
        <label className="checkLabel">
          <input type="checkbox" checked={showHeatmap} disabled={activities.length === 0}
            onChange={(e) => setShowHeatmap(e.target.checked)} />
          Afficher
        </label>
        <button className="ghost" onClick={loadActivities} disabled={loadingActivities}>
          {loadingActivities ? "Import…" : activities.length ? `Actualiser mes sorties (${activities.length})` : "Charger mes sorties vélo"}
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
        <button className="ghost" onClick={computeCoverage} disabled={computingCoverage || activities.length === 0}>
          {computingCoverage ? "Calcul…" : "Calculer les routes nouvelles"}
        </button>
      </footer>
    </main>
  );
}
