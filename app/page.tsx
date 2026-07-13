"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { RouteItem } from "@/lib/types";

const RoutesMap = dynamic(() => import("@/components/RoutesMap"), {
  ssr: false,
  loading: () => <div className="mapLoading">Chargement de la carte…</div>
});

type SortKey = "near" | "distance" | "elevation" | "name";

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

  useEffect(() => {
    const saved = localStorage.getItem("route-picker-routes");
    const savedFavs = localStorage.getItem("route-picker-favorites");
    if (saved) {
      try { setRoutes(JSON.parse(saved)); } catch {}
    }
    if (savedFavs) {
      try { setFavorites(JSON.parse(savedFavs)); } catch {}
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
        return a.distance - b.distance;
      });
  }, [routes, query, minDistance, maxDistance, maxElevation, sort, showFavorites, favorites]);

  const selected = filteredRoutes.find((route) => route.id === selectedId) ?? null;

  return (
    <main>
      <header className="topbar">
        <div>
          <div className="eyebrow">ROUTE PICKER</div>
          <h1>Trouve le bon parcours, sans fouiller dans Strava.</h1>
        </div>
        <div className="headerActions">
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

      <section className="workspace">
        <aside className="panel">
          <div className="filters">
            <label>
              Rechercher
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Beaujolais, Chartreuse…"
              />
            </label>

            <div className="twoCols">
              <label>
                Distance min.
                <input type="number" min="0" value={minDistance}
                  onChange={(e) => setMinDistance(Number(e.target.value))} />
              </label>
              <label>
                Distance max.
                <input type="number" min="0" value={maxDistance}
                  onChange={(e) => setMaxDistance(Number(e.target.value))} />
              </label>
            </div>

            <label>
              Dénivelé max.
              <input type="number" min="0" step="100" value={maxElevation}
                onChange={(e) => setMaxElevation(Number(e.target.value))} />
            </label>

            <div className="twoCols">
              <label>
                Trier par
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  <option value="distance">Distance</option>
                  <option value="elevation">Dénivelé</option>
                  <option value="name">Nom</option>
                </select>
              </label>
              <label className="checkLabel">
                <input type="checkbox" checked={showFavorites}
                  onChange={(e) => setShowFavorites(e.target.checked)} />
                Mes favoris
              </label>
            </div>
          </div>

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
          />
          {selected && (
            <div className="selectedRoute">
              <div>
                <strong>{selected.name}</strong>
                <span>{km(selected.distance)} km · {rounded(selected.elevation_gain)} m D+</span>
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
    </main>
  );
}
