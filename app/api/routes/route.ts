import { NextResponse } from "next/server";
import { fetchAllRoutes } from "@/lib/strava";

export async function GET() {
  try {
    const routes = await fetchAllRoutes();
    if (!routes) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    return NextResponse.json({ routes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
