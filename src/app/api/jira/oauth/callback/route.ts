import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  atlassianRedirectUri,
  exchangeAuthorizationCode,
  JIRA_OAUTH_NEXT_COOKIE,
  JIRA_OAUTH_STATE_COOKIE,
  persistOAuthUserLogin,
} from "@/lib/jira-oauth";

export const dynamic = "force-dynamic";

function safeNext(raw: string | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.startsWith("/login")) return "/";
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const origin = url.origin;

  const jar = await cookies();
  const expected = jar.get(JIRA_OAUTH_STATE_COOKIE)?.value;
  const next = safeNext(jar.get(JIRA_OAUTH_NEXT_COOKIE)?.value);
  jar.delete(JIRA_OAUTH_STATE_COOKIE);
  jar.delete(JIRA_OAUTH_NEXT_COOKIE);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error)}`,
    );
  }

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("État OAuth invalide — réessayez.")}`,
    );
  }

  try {
    const redirectUri = atlassianRedirectUri(origin);
    const tokens = await exchangeAuthorizationCode(code, redirectUri);
    await persistOAuthUserLogin({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });
    // Login utilisateur uniquement — le token de sync partagé n’est pas modifié.
    return NextResponse.redirect(`${origin}${next}`);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Échec connexion OAuth";
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(message)}`,
    );
  }
}
