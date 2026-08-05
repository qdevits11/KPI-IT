import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  atlassianRedirectUri,
  exchangeAuthorizationCode,
  JIRA_OAUTH_STATE_COOKIE,
  persistOAuthConnection,
} from "@/lib/jira-oauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const origin = url.origin;

  if (error) {
    return NextResponse.redirect(
      `${origin}/jira?oauth=error&message=${encodeURIComponent(error)}`,
    );
  }

  const jar = await cookies();
  const expected = jar.get(JIRA_OAUTH_STATE_COOKIE)?.value;
  jar.delete(JIRA_OAUTH_STATE_COOKIE);

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(
      `${origin}/jira?oauth=error&message=${encodeURIComponent("État OAuth invalide — réessayez.")}`,
    );
  }

  try {
    const redirectUri = atlassianRedirectUri(origin);
    const tokens = await exchangeAuthorizationCode(code, redirectUri);
    await persistOAuthConnection({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });
    return NextResponse.redirect(`${origin}/jira?oauth=ok`);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Échec connexion OAuth";
    return NextResponse.redirect(
      `${origin}/jira?oauth=error&message=${encodeURIComponent(message)}`,
    );
  }
}
