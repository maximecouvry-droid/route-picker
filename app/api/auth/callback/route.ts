import { NextRequest, NextResponse } from "next/server";
import { setSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/?strava=denied`);
  }

  const body = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID || "",
    client_secret: process.env.STRAVA_CLIENT_SECRET || "",
    code,
    grant_type: "authorization_code"
  });

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store"
  });

  if (!response.ok) {
    return NextResponse.redirect(`${baseUrl}/?strava=error`);
  }

  const data = await response.json();
  await setSession({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athleteId: data.athlete.id
  });

  return NextResponse.redirect(`${baseUrl}/`);
}
