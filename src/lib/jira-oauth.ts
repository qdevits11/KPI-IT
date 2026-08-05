/**
 * OAuth 2.0 (3LO) Atlassian — le login Atlassian propose Microsoft SSO
 * si le site Coverseal l’a configuré.
 */

import {
  DEFAULT_JIRA_SETTINGS,
  normalizeConnection,
  normalizeCustomFieldId,
  resolveJiraConnection,
  writeJiraConnection,
  type JiraConnection,
} from "./jira-auth";
import { isAdmin, buildAppUser } from "./roles";
import { writeUserSession } from "./user-session";

export const JIRA_OAUTH_STATE_COOKIE = "kpi_jira_oauth_state";

export const JIRA_OAUTH_SCOPES = [
  "read:jira-work",
  "write:jira-work",
  "read:jira-user",
  "offline_access",
].join(" ");

export function atlassianOAuthConfigured(): boolean {
  return Boolean(
    process.env.ATLASSIAN_CLIENT_ID?.trim() &&
      process.env.ATLASSIAN_CLIENT_SECRET?.trim(),
  );
}

export function atlassianRedirectUri(requestOrigin?: string): string {
  const fromEnv = process.env.ATLASSIAN_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const origin =
    requestOrigin?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`
      : "http://localhost:3000");
  return `${origin}/api/jira/oauth/callback`;
}

export function buildAtlassianAuthorizeUrl(opts: {
  state: string;
  redirectUri: string;
}): string {
  const clientId = process.env.ATLASSIAN_CLIENT_ID!.trim();
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: clientId,
    scope: JIRA_OAUTH_SCOPES,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    response_type: "code",
    prompt: "consent",
  });
  return `https://auth.atlassian.com/authorize?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function exchangeToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.ATLASSIAN_CLIENT_ID!.trim(),
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET!.trim(),
      ...body,
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(
      json.error_description || json.error || `Échange token Atlassian HTTP ${res.status}`,
    );
  }
  if (!json.access_token) {
    throw new Error("Réponse token Atlassian sans access_token");
  }
  return json;
}

export async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  return exchangeToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenResponse> {
  return exchangeToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

interface AccessibleResource {
  id: string;
  url: string;
  name: string;
  scopes?: string[];
}

export async function fetchAccessibleResources(
  accessToken: string,
): Promise<AccessibleResource[]> {
  const res = await fetch(
    "https://api.atlassian.com/oauth/token/accessible-resources",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`accessible-resources HTTP ${res.status}`);
  }
  return (await res.json()) as AccessibleResource[];
}

export async function fetchAtlassianMe(accessToken: string): Promise<{
  account_id?: string;
  email?: string;
  name?: string;
}> {
  const res = await fetch("https://api.atlassian.com/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return {};
  return (await res.json()) as {
    account_id?: string;
    email?: string;
    name?: string;
  };
}

function pickResource(
  resources: AccessibleResource[],
  preferredBaseUrl?: string,
): AccessibleResource | null {
  if (resources.length === 0) return null;
  if (preferredBaseUrl) {
    const want = preferredBaseUrl.replace(/\/$/, "").toLowerCase();
    const match = resources.find(
      (r) => r.url.replace(/\/$/, "").toLowerCase() === want,
    );
    if (match) return match;
  }
  const envUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, "").toLowerCase();
  if (envUrl) {
    const match = resources.find(
      (r) => r.url.replace(/\/$/, "").toLowerCase() === envUrl,
    );
    if (match) return match;
  }
  return resources[0] ?? null;
}

/** Construit / met à jour la connexion après OAuth réussi. */
export async function persistOAuthConnection(opts: {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  preferredBaseUrl?: string;
}): Promise<JiraConnection> {
  const [resources, me, existing] = await Promise.all([
    fetchAccessibleResources(opts.accessToken),
    fetchAtlassianMe(opts.accessToken),
    resolveJiraConnection(),
  ]);
  const site = pickResource(resources, opts.preferredBaseUrl ?? existing?.baseUrl);
  if (!site) {
    throw new Error(
      "Aucun site Jira autorisé pour ce compte. Vérifiez le consentement OAuth.",
    );
  }

  const expiresAt = new Date(
    Date.now() + Math.max(30, opts.expiresIn - 60) * 1000,
  ).toISOString();

  const conn = normalizeConnection({
    ...(existing ?? {}),
    baseUrl: site.url.replace(/\/$/, ""),
    email: me.email || existing?.email || me.name || "oauth-user",
    apiToken: "",
    authMode: "oauth",
    accessToken: opts.accessToken,
    refreshToken: opts.refreshToken || existing?.refreshToken,
    cloudId: site.id,
    tokenExpiresAt: expiresAt,
    accountDisplayName: me.name || me.email,
    jqlBase: existing?.jqlBase || DEFAULT_JIRA_SETTINGS.jqlBase,
    openStatusJql: existing?.openStatusJql || DEFAULT_JIRA_SETTINGS.openStatusJql,
    datePriseEnChargeJql:
      existing?.datePriseEnChargeJql ||
      DEFAULT_JIRA_SETTINGS.datePriseEnChargeJql,
    datePriseEnChargeFieldId:
      existing?.datePriseEnChargeFieldId ||
      DEFAULT_JIRA_SETTINGS.datePriseEnChargeFieldId,
    slaPriseEnChargeHours:
      existing?.slaPriseEnChargeHours ??
      DEFAULT_JIRA_SETTINGS.slaPriseEnChargeHours,
    slaClotureHours:
      existing?.slaClotureHours ?? DEFAULT_JIRA_SETTINGS.slaClotureHours,
    categoryField: existing?.categoryField || DEFAULT_JIRA_SETTINGS.categoryField,
    categoryCustomFieldId: normalizeCustomFieldId(
      existing?.categoryCustomFieldId ||
        DEFAULT_JIRA_SETTINGS.categoryCustomFieldId,
    ),
    connectedAt: new Date().toISOString(),
  });

  if (!conn) {
    throw new Error("Impossible de normaliser la connexion OAuth");
  }

  const user = buildAppUser(conn.email, conn.accountDisplayName);
  await writeUserSession({
    email: user.email,
    displayName: conn.accountDisplayName,
    authMode: "oauth",
    accessToken: conn.accessToken,
    refreshToken: conn.refreshToken,
    cloudId: conn.cloudId,
    tokenExpiresAt: conn.tokenExpiresAt,
    baseUrl: conn.baseUrl,
    connectedAt: conn.connectedAt,
  });

  // Compte partagé (sync KPI) : réservé à l’admin pour ne pas écraser le token de sync
  if (isAdmin(user)) {
    await writeJiraConnection(conn);
  }

  return conn;
}

/** Rafraîchit le Bearer si proche de l’expiration ; persiste le nouveau couple. */
export async function ensureFreshOAuthConnection(
  conn: JiraConnection,
): Promise<JiraConnection> {
  if (conn.authMode !== "oauth" || !conn.accessToken) return conn;

  const expiresAt = conn.tokenExpiresAt
    ? Date.parse(conn.tokenExpiresAt)
    : 0;
  const stillValid =
    Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000;
  if (stillValid) return conn;

  if (!conn.refreshToken) {
    throw new Error(
      "Session OAuth expirée — reconnectez-vous via Atlassian / Microsoft.",
    );
  }
  if (!atlassianOAuthConfigured()) {
    throw new Error("OAuth Atlassian non configuré (CLIENT_ID / SECRET).");
  }

  const tokens = await refreshAccessToken(conn.refreshToken);
  return persistOAuthConnection({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || conn.refreshToken,
    expiresIn: tokens.expires_in,
    preferredBaseUrl: conn.baseUrl,
  });
}

/** Connexion prête pour lectures / écritures (refresh OAuth inclus). */
export async function resolveFreshJiraConnection(): Promise<JiraConnection | null> {
  const conn = await resolveJiraConnection();
  if (!conn) return null;
  if (conn.authMode === "oauth") {
    try {
      return await ensureFreshOAuthConnection(conn);
    } catch (err) {
      console.warn("Refresh OAuth Jira échoué:", err);
      return null;
    }
  }
  return conn;
}
