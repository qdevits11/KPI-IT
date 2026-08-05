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
import {
  readUserSession,
  writeUserSession,
  type UserSessionPayload,
} from "./user-session";

export const JIRA_OAUTH_STATE_COOKIE = "kpi_jira_oauth_state";
/** Destination après login OAuth (chemin relatif). */
export const JIRA_OAUTH_NEXT_COOKIE = "kpi_jira_oauth_next";

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

async function buildOAuthConnection(opts: {
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
  const site = pickResource(
    resources,
    opts.preferredBaseUrl ?? existing?.baseUrl,
  );
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
    openStatusJql:
      existing?.openStatusJql || DEFAULT_JIRA_SETTINGS.openStatusJql,
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
    categoryField:
      existing?.categoryField || DEFAULT_JIRA_SETTINGS.categoryField,
    categoryCustomFieldId: normalizeCustomFieldId(
      existing?.categoryCustomFieldId ||
        DEFAULT_JIRA_SETTINGS.categoryCustomFieldId,
    ),
    connectedAt: new Date().toISOString(),
  });

  if (!conn) {
    throw new Error("Impossible de normaliser la connexion OAuth");
  }
  return conn;
}

/**
 * Login utilisateur : session navigateur uniquement.
 * N’écrase jamais le token de synchronisation partagé.
 */
export async function persistOAuthUserLogin(opts: {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  preferredBaseUrl?: string;
}): Promise<{ email: string; displayName?: string; connection: JiraConnection }> {
  const conn = await buildOAuthConnection(opts);
  await writeUserSession({
    email: conn.email,
    displayName: conn.accountDisplayName,
    authMode: "oauth",
    accessToken: conn.accessToken,
    refreshToken: conn.refreshToken,
    cloudId: conn.cloudId,
    tokenExpiresAt: conn.tokenExpiresAt,
    baseUrl: conn.baseUrl,
    connectedAt: conn.connectedAt,
  });
  return {
    email: conn.email,
    displayName: conn.accountDisplayName,
    connection: conn,
  };
}

/**
 * Met à jour uniquement le compte Jira partagé (sync KPI).
 * N’écrit pas la session utilisateur.
 */
export async function persistSharedOAuthTokens(opts: {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  preferredBaseUrl?: string;
}): Promise<JiraConnection> {
  const conn = await buildOAuthConnection(opts);
  await writeJiraConnection(conn);
  return conn;
}

/** Alias login-only (ne touche pas au token de sync). */
export async function persistOAuthConnection(opts: {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  preferredBaseUrl?: string;
}): Promise<JiraConnection> {
  const { connection } = await persistOAuthUserLogin(opts);
  return connection;
}

function connectionFromUserSession(
  session: UserSessionPayload,
): JiraConnection | null {
  if (session.authMode !== "oauth" || !session.accessToken || !session.baseUrl) {
    return null;
  }
  return normalizeConnection({
    baseUrl: session.baseUrl,
    email: session.email,
    apiToken: "",
    authMode: "oauth",
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    cloudId: session.cloudId,
    tokenExpiresAt: session.tokenExpiresAt,
    accountDisplayName: session.displayName,
    jqlBase: DEFAULT_JIRA_SETTINGS.jqlBase,
    openStatusJql: DEFAULT_JIRA_SETTINGS.openStatusJql,
    datePriseEnChargeJql: DEFAULT_JIRA_SETTINGS.datePriseEnChargeJql,
    datePriseEnChargeFieldId: DEFAULT_JIRA_SETTINGS.datePriseEnChargeFieldId,
    slaPriseEnChargeHours: DEFAULT_JIRA_SETTINGS.slaPriseEnChargeHours,
    slaClotureHours: DEFAULT_JIRA_SETTINGS.slaClotureHours,
    categoryField: DEFAULT_JIRA_SETTINGS.categoryField,
    categoryCustomFieldId: DEFAULT_JIRA_SETTINGS.categoryCustomFieldId,
    connectedAt: session.connectedAt,
  });
}

/** Rafraîchit le Bearer du compte partagé (sync) sans toucher à la session user. */
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
      "Session OAuth expirée — reconnectez le compte de synchronisation.",
    );
  }
  if (!atlassianOAuthConfigured()) {
    throw new Error("OAuth Atlassian non configuré (CLIENT_ID / SECRET).");
  }

  const tokens = await refreshAccessToken(conn.refreshToken);
  return persistSharedOAuthTokens({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || conn.refreshToken,
    expiresIn: tokens.expires_in,
    preferredBaseUrl: conn.baseUrl,
  });
}

async function ensureFreshPersonalOAuth(
  session: UserSessionPayload,
): Promise<JiraConnection | null> {
  let conn = connectionFromUserSession(session);
  if (!conn) return null;

  const expiresAt = conn.tokenExpiresAt
    ? Date.parse(conn.tokenExpiresAt)
    : 0;
  const stillValid =
    Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000;
  if (stillValid) return conn;

  if (!conn.refreshToken || !atlassianOAuthConfigured()) return null;
  const tokens = await refreshAccessToken(conn.refreshToken);
  await persistOAuthUserLogin({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || conn.refreshToken,
    expiresIn: tokens.expires_in,
    preferredBaseUrl: conn.baseUrl,
  });
  const refreshed = await readUserSession();
  return refreshed ? connectionFromUserSession(refreshed) : null;
}

/**
 * Connexion partagée pour sync / lectures KPI (token actuel en base).
 * Refresh OAuth partagé si besoin — n’altère pas la session utilisateur.
 */
export async function resolveFreshJiraConnection(): Promise<JiraConnection | null> {
  const conn = await resolveJiraConnection();
  if (!conn) return null;
  if (conn.authMode === "oauth") {
    try {
      return await ensureFreshOAuthConnection(conn);
    } catch (err) {
      console.warn("Refresh OAuth Jira (sync) échoué:", err);
      return null;
    }
  }
  return conn;
}

/**
 * Connexion pour actions tickets : OAuth personnel (login) en priorité,
 * sinon compte partagé s’il est en OAuth.
 */
export async function resolveTicketWriteConnection(): Promise<JiraConnection | null> {
  const session = await readUserSession();
  if (session?.authMode === "oauth" && session.accessToken) {
    try {
      const personal = await ensureFreshPersonalOAuth(session);
      if (personal) return personal;
    } catch (err) {
      console.warn("Refresh OAuth personnel échoué:", err);
    }
  }

  const shared = await resolveFreshJiraConnection();
  if (shared?.authMode === "oauth") return shared;
  return null;
}
