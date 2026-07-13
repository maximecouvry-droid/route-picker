import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (!clientId) {
    return NextResponse.json({ error: "STRAVA_CLIENT_ID manquant" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/auth/callback`,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,read_all"
  });

  return NextResponse.redirect(`https://www.strava.com/oauth/authorize?${params}`);
}
