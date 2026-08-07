import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  atlassianRedirectUri,
  exchangeAuthorizationCode,
  fetchAtlassianMe,
  fetchAccessibleResources,
  JIRA_OAUTH_NEXT_COOKIE,
  JIRA_OAUTH_STATE_COOKIE,
  persistUserOAuthTokens,
} from "@/lib/jira-oauth";
import {
  attachUserSessionCookie,
  type UserSessionPayload,
} from "@/lib/user-session";
import { pickAvatarUrl } from "@/lib/avatars";

export const dynamic = "force-dynamic";

function safeNext(raw: string | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.startsWith("/login")) return "/";
  return raw;
}

async function resolveLoginIdentity(accessToken: string): Promise<{
  email: string;
  displayName?: string;
  avatarUrl?: string;
}> {
  const me = await fetchAtlassianMe(accessToken);
  let email = (me.email || "").trim().toLowerCase();
  let displayName = me.name?.trim() || undefined;
  let avatarUrl: string | undefined = me.picture?.trim() || undefined;

  try {
    const resources = await fetchAccessibleResources(accessToken);
    const site = resources[0];
    if (site) {
      const res = await fetch(
        `https://api.atlassian.com/ex/jira/${site.id}/rest/api/3/myself`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
          cache: "no-store",
        },
      );
      if (res.ok) {
        const myself = (await res.json()) as {
          emailAddress?: string;
          displayName?: string;
          avatarUrls?: Record<string, string>;
        };
        if (myself.emailAddress?.includes("@")) {
          email = myself.emailAddress.trim().toLowerCase();
        }
        displayName = myself.displayName?.trim() || displayName;
        avatarUrl = pickAvatarUrl(myself.avatarUrls) || avatarUrl;
      }
    }
  } catch {
    // validated below
  }

  if (!email || !email.includes("@")) {
    throw new Error(
      "Impossible de lire l’email du compte Atlassian. Vérifiez les scopes OAuth (read:jira-user).",
    );
  }
  return { email, displayName, avatarUrl };
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
    const identity = await resolveLoginIdentity(tokens.access_token);

    const payload: UserSessionPayload = {
      email: identity.email,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      authMode: "oauth",
      connectedAt: new Date().toISOString(),
    };

    try {
      // Tokens personnels → actions tickets sous l’identité de l’utilisateur.
      await persistUserOAuthTokens(identity.email, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
      });
    } catch (err) {
      console.warn("Persistance tokens Jira user (callback) échouée:", err);
    }

    try {
      const { mergePeopleFromJira, recordUserLogin } = await import(
        "@/lib/store"
      );
      await recordUserLogin({
        email: identity.email,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
      });
      if (identity.displayName && identity.avatarUrl) {
        await mergePeopleFromJira([
          {
            displayName: identity.displayName,
            avatarUrl: identity.avatarUrl,
            updatedAt: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      // ignore — la session est tout de même créée
    }

    const response = NextResponse.redirect(`${origin}${next}`);
    attachUserSessionCookie(response, payload);
    return response;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Échec connexion OAuth";
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(message)}`,
    );
  }
}
