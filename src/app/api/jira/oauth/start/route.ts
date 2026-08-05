import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import {
  atlassianOAuthConfigured,
  atlassianRedirectUri,
  buildAtlassianAuthorizeUrl,
  JIRA_OAUTH_STATE_COOKIE,
} from "@/lib/jira-oauth";

export const dynamic = "force-dynamic";

/** Démarre le flux OAuth Atlassian (SSO Microsoft possible sur l’écran de login). */
export async function GET(request: Request) {
  if (!atlassianOAuthConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "OAuth Atlassian non configuré. Définissez ATLASSIAN_CLIENT_ID et ATLASSIAN_CLIENT_SECRET sur Vercel, et créez une app OAuth 2.0 sur developer.atlassian.com.",
      },
      { status: 503 },
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri = atlassianRedirectUri(origin);
  const state = randomBytes(24).toString("hex");
  const jar = await cookies();
  jar.set(JIRA_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const url = buildAtlassianAuthorizeUrl({ state, redirectUri });
  return NextResponse.redirect(url);
}
