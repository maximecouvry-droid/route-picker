import JSONbig from "json-bigint";
import { getSession, setSession, type Session } from "@/lib/session";

const STRAVA_API = "https://www.strava.com/api/v3";
const jsonBig = JSONbig({ storeAsString: true });

async function refresh(session: Session): Promise<Session> {
  const body = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID || "",
    client_secret: process.env.STRAVA_CLIENT_SECRET || "",
    grant_type: "refresh_token",
    refresh_token: session.refreshToken
  });

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store"
  });

  if (!response.ok) throw new Error("Le renouvellement du jeton Strava a échoué.");
  const data = await response.json();
  const next: Session = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athleteId: session.athleteId
  };
  await setSession(next);
  return next;
}

export async function getValidSession() {
  const session = await getSession();
  if (!session) return null;
  if (session.expiresAt > Math.floor(Date.now() / 1000) + 60) return session;
  return refresh(session);
}

export async function fetchAllRoutes() {
  const session = await getValidSession();
  if (!session) return null;

  const all = [];
  for (let page = 1; page <= 20; page++) {
    const url = `${STRAVA_API}/athletes/${session.athleteId}/routes?page=${page}&per_page=100`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: "no-store"
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Erreur Strava ${response.status}: ${details}`);
    }

    const raw = await response.text();
    const batch = jsonBig.parse(raw);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

const CYCLING_SPORT_TYPES = new Set([
  "Ride",
  "GravelRide",
  "MountainBikeRide",
  "EBikeRide",
  "Handcycle",
  "Velomobile"
]);

export async function fetchAllCyclingActivities() {
  const session = await getValidSession();
  if (!session) return null;

  const all = [];
  for (let page = 1; page <= 50; page++) {
    const url = `${STRAVA_API}/athlete/activities?page=${page}&per_page=200`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: "no-store"
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Erreur Strava ${response.status}: ${details}`);
    }

    const raw = await response.text();
    const batch = jsonBig.parse(raw);
    all.push(...batch);
    if (batch.length < 200) break;
  }
  return all.filter((activity) => CYCLING_SPORT_TYPES.has(activity.sport_type));
}
