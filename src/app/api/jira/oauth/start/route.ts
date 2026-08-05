import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import {
  atlassianOAuthConfigured,
  atlassianRedirectUri,
  buildAtlassianAuthorizeUrl,
  JIRA_OAUTH_NEXT_COOKIE,
  JIRA_OAUTH_STATE_COOKIE,
} from "@/lib/jira-oauth";

export const dynamic = "force-dynamic";

function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.startsWith("/login")) return "/";
  return raw;
}

/** Démarre le flux OAuth Atlassian pour la connexion utilisateur. */
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

  const url = new URL(request.url);
  const origin = url.origin;
  const redirectUri = atlassianRedirectUri(origin);
  const state = randomBytes(24).toString("hex");
  const next = safeNext(url.searchParams.get("next"));
  const jar = await cookies();
  jar.set(JIRA_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  jar.set(JIRA_OAUTH_NEXT_COOKIE, next, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const authorizeUrl = buildAtlassianAuthorizeUrl({ state, redirectUri });
  return NextResponse.redirect(authorizeUrl);
}
