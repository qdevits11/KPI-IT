/**
 * OAuth 2.0 (3LO) Atlassian — le login Atlassian propose Microsoft SSO
 * si le site Coverseal l’a configuré.
 */

import {
  DEFAULT_JIRA_SETTINGS,
  decryptConnection,
  encryptConnection,
  normalizeConnection,
  normalizeCustomFieldId,
  resolveJiraConnection,
  writeJiraConnection,
  type JiraConnection,
} from "./jira-auth";
import {
  clearUserJiraCipherFromSupabase,
  loadUserJiraCipherFromSupabase,
  saveUserJiraCipherToSupabase,
  supabaseConfigured,
} from "./supabase-db";
import { readUserSession, writeUserSession } from "./user-session";

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
  picture?: string;
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
    picture?: string;
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
 * Persiste les tokens OAuth personnels (actions tickets) côté serveur.
 * Le cookie de session reste identité seule (trop volumineux sinon).
 */
export async function persistUserOAuthTokens(
  email: string,
  opts: {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    preferredBaseUrl?: string;
  },
): Promise<JiraConnection> {
  const key = email.trim().toLowerCase();
  if (!key) throw new Error("Email requis pour les tokens Jira user");

  const conn = await buildOAuthConnection(opts);
  // Force l’email session (pas celui du compte sync partagé).
  const personal: JiraConnection = {
    ...conn,
    email: key,
  };
  const cipher = encryptConnection(personal);

  if (supabaseConfigured()) {
    const ok = await saveUserJiraCipherToSupabase(key, cipher);
    if (!ok) {
      throw new Error(
        "Impossible d’enregistrer vos tokens Jira — réessayez la connexion.",
      );
    }
  } else {
    // Dev sans Supabase : tokens dans la session (taille limitée).
    const session = await readUserSession();
    if (session?.email?.toLowerCase() === key) {
      await writeUserSession({
        ...session,
        authMode: "oauth",
        accessToken: personal.accessToken,
        refreshToken: personal.refreshToken,
        cloudId: personal.cloudId,
        tokenExpiresAt: personal.tokenExpiresAt,
        baseUrl: personal.baseUrl,
      });
    }
  }

  return personal;
}

export async function loadUserOAuthConnection(
  email: string,
): Promise<JiraConnection | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;

  if (supabaseConfigured()) {
    const cipher = await loadUserJiraCipherFromSupabase(key);
    if (cipher) return decryptConnection(cipher);
  }

  const session = await readUserSession();
  if (
    session?.email?.toLowerCase() === key &&
    session.authMode === "oauth" &&
    session.accessToken &&
    session.cloudId
  ) {
    const shared = await resolveJiraConnection();
    return normalizeConnection({
      ...(shared ?? {}),
      baseUrl: session.baseUrl || shared?.baseUrl || "",
      email: key,
      apiToken: "",
      authMode: "oauth",
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      cloudId: session.cloudId,
      tokenExpiresAt: session.tokenExpiresAt,
      jqlBase: shared?.jqlBase || DEFAULT_JIRA_SETTINGS.jqlBase,
      openStatusJql:
        shared?.openStatusJql || DEFAULT_JIRA_SETTINGS.openStatusJql,
      datePriseEnChargeJql:
        shared?.datePriseEnChargeJql ||
        DEFAULT_JIRA_SETTINGS.datePriseEnChargeJql,
      datePriseEnChargeFieldId:
        shared?.datePriseEnChargeFieldId ||
        DEFAULT_JIRA_SETTINGS.datePriseEnChargeFieldId,
      slaPriseEnChargeHours:
        shared?.slaPriseEnChargeHours ??
        DEFAULT_JIRA_SETTINGS.slaPriseEnChargeHours,
      slaClotureHours:
        shared?.slaClotureHours ?? DEFAULT_JIRA_SETTINGS.slaClotureHours,
      categoryField:
        shared?.categoryField || DEFAULT_JIRA_SETTINGS.categoryField,
      categoryCustomFieldId: normalizeCustomFieldId(
        shared?.categoryCustomFieldId ||
          DEFAULT_JIRA_SETTINGS.categoryCustomFieldId,
      ),
      connectedAt: session.connectedAt,
    });
  }

  return null;
}

export async function clearUserOAuthTokens(email: string): Promise<void> {
  const key = email.trim().toLowerCase();
  if (!key) return;
  if (supabaseConfigured()) {
    await clearUserJiraCipherFromSupabase(key);
  }
}

/**
 * Login utilisateur : identité cookie + tokens personnels (actions tickets).
 * Ne touche pas au compte de sync partagé.
 */
export async function persistOAuthUserLogin(opts: {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  preferredBaseUrl?: string;
}): Promise<{ email: string; displayName?: string }> {
  const me = await fetchAtlassianMe(opts.accessToken);
  let email = (me.email || "").trim().toLowerCase();
  let displayName = me.name?.trim() || undefined;
  let avatarUrl = me.picture?.trim() || undefined;

  try {
    const resources = await fetchAccessibleResources(opts.accessToken);
    const site = pickResource(resources, opts.preferredBaseUrl);
    if (site) {
      const res = await fetch(
        `https://api.atlassian.com/ex/jira/${site.id}/rest/api/3/myself`,
        {
          headers: {
            Authorization: `Bearer ${opts.accessToken}`,
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
        const { pickAvatarUrl } = await import("./avatars");
        avatarUrl = pickAvatarUrl(myself.avatarUrls) || avatarUrl;
      }
    }
  } catch {
    // ignore — on valide l’email ci-dessous
  }

  if (!email || !email.includes("@")) {
    throw new Error(
      "Impossible de lire l’email du compte Atlassian. Vérifiez les scopes OAuth (read:jira-user).",
    );
  }

  await writeUserSession({
    email,
    displayName,
    avatarUrl,
    authMode: "oauth",
    connectedAt: new Date().toISOString(),
  });

  try {
    await persistUserOAuthTokens(email, opts);
  } catch (err) {
    console.warn("Persistance tokens Jira user échouée:", err);
  }

  try {
    const { recordUserLogin } = await import("./store");
    await recordUserLogin({ email, displayName, avatarUrl });
  } catch {
    // ignore
  }

  return { email, displayName };
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

/** Alias login (identité + tokens user, pas de sync partagée). */
export async function persistOAuthConnection(opts: {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  preferredBaseUrl?: string;
}): Promise<{ email: string; displayName?: string }> {
  return persistOAuthUserLogin(opts);
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

async function ensureFreshUserOAuthConnection(
  email: string,
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
      "Session Jira expirée — reconnectez-vous (Microsoft / Atlassian).",
    );
  }
  if (!atlassianOAuthConfigured()) {
    throw new Error("OAuth Atlassian non configuré (CLIENT_ID / SECRET).");
  }

  const tokens = await refreshAccessToken(conn.refreshToken);
  return persistUserOAuthTokens(email, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || conn.refreshToken,
    expiresIn: tokens.expires_in,
    preferredBaseUrl: conn.baseUrl,
  });
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
 * Connexion pour actions tickets : tokens OAuth de l’utilisateur connecté.
 * Les écritures Jira se font sous son identité, pas le compte admin de sync.
 */
export async function resolveTicketWriteConnection(): Promise<JiraConnection | null> {
  const session = await readUserSession();
  if (!session?.email) return null;

  const personal = await loadUserOAuthConnection(session.email);
  if (!personal?.accessToken || personal.authMode !== "oauth") return null;

  try {
    const fresh = await ensureFreshUserOAuthConnection(session.email, personal);
    // Recouvre les réglages champs / JQL depuis le compte sync partagé.
    const shared = await resolveJiraConnection();
    if (!shared) return fresh;
    return {
      ...fresh,
      jqlBase: shared.jqlBase,
      openStatusJql: shared.openStatusJql,
      datePriseEnChargeJql: shared.datePriseEnChargeJql,
      datePriseEnChargeFieldId: shared.datePriseEnChargeFieldId,
      slaPriseEnChargeHours: shared.slaPriseEnChargeHours,
      slaClotureHours: shared.slaClotureHours,
      categoryField: shared.categoryField,
      categoryCustomFieldId: shared.categoryCustomFieldId,
    };
  } catch (err) {
    console.warn("Refresh OAuth Jira (user) échoué:", err);
    return null;
  }
}
