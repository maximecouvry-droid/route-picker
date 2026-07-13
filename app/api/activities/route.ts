import { NextResponse } from "next/server";
import { fetchAllCyclingActivities } from "@/lib/strava";

export async function GET() {
  try {
    const activities = await fetchAllCyclingActivities();
    if (!activities) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    return NextResponse.json({ activities });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
