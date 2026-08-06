import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import {
  clearJiraCipherFromSupabase,
  loadJiraCipherFromSupabase,
  saveJiraCipherToSupabase,
  supabaseConfigured,
} from "./supabase-db";
import { resolveAppSecret } from "./secrets";

export const JIRA_COOKIE = "kpi_jira_session";

export type JiraConnectionSource = "supabase" | "cookie" | "env";

export type JiraAuthMode = "basic" | "oauth";

export interface JiraConnection {
  baseUrl: string;
  email: string;
  /** Token API Atlassian (mode basic). Vide en mode OAuth. */
  apiToken: string;
  /** basic = email+token API ; oauth = connexion Atlassian (SSO Microsoft possible). */
  authMode: JiraAuthMode;
  /** Bearer OAuth (mode oauth). */
  accessToken?: string;
  refreshToken?: string;
  /** Cloud ID site Jira (mode oauth). */
  cloudId?: string;
  /** ISO expiry de accessToken. */
  tokenExpiresAt?: string;
  /** Nom affiché du compte OAuth. */
  accountDisplayName?: string;
  /** Filtre JQL de base — n8n: project = CSD */
  jqlBase: string;
  /**
   * JQL pour les tickets « ouverts » / non résolus.
   * n8n: status NOT IN (Partenaire, Canceled, Done)
   */
  openStatusJql: string;
  /**
   * Nom JQL du champ Date Prise en Charge.
   * n8n: "Date Prise en Charge" → customfield_10284
   */
  datePriseEnChargeJql: string;
  /** ID API du champ (pour fields=) */
  datePriseEnChargeFieldId: string;
  /** Seuil SLA prise en charge (heures ouvrées) — n8n: 24 */
  slaPriseEnChargeHours: number;
  /** Seuil SLA clôture (heures ouvrées) — n8n: 48 */
  slaClotureHours: number;
  /**
   * Source de la « catégorie / type de demande ».
   * - auto : détecte le customfield IT (Elfsquad, Odoo…) — recommandé
   * - requestType : Customer Request Type JSM (souvent le canal : mail/portail)
   * - component | label | issuetype
   * - custom → lit categoryCustomFieldId (ex. customfield_10001)
   */
  categoryField:
    | "auto"
    | "requestType"
    | "component"
    | "label"
    | "issuetype"
    | "custom";
  /** ID API du champ custom (si categoryField = custom), ou hint pour requestType */
  categoryCustomFieldId: string;
  connectedAt: string;
}

export const DEFAULT_JIRA_SETTINGS = {
  jqlBase: "project = CSD",
  openStatusJql: "status NOT IN (Partenaire, Canceled, Done)",
  datePriseEnChargeJql: "Date Prise en Charge",
  datePriseEnChargeFieldId: "customfield_10284",
  slaPriseEnChargeHours: 24,
  slaClotureHours: 48,
  /** Auto = champ IT Coverseal (pas le Request Type de canal mail) */
  categoryField: "custom" as const,
  /** Champ Jira « Catégorie » (Coverseal CSD) */
  categoryCustomFieldId: "customfield_10152",
};

function secretKey(): Buffer {
  const raw = resolveAppSecret("jira-connection");
  return createHash("sha256").update(raw).digest();
}

export function encryptConnection(conn: JiraConnection): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(conn), "utf-8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptConnection(token: string): JiraConnection | null {
  try {
    const buf = Buffer.from(token, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    const parsed = JSON.parse(dec.toString("utf-8")) as Partial<JiraConnection>;
    return normalizeConnection(parsed);
  } catch {
    return null;
  }
}

/** Migre d'anciennes sessions (champs SLA JSM) vers le modèle n8n */
export function normalizeConnection(
  partial: Partial<JiraConnection> & {
    slaResolution?: string;
    slaFirstResponse?: string;
  },
): JiraConnection | null {
  const authMode: JiraAuthMode =
    partial.authMode === "oauth" ||
    (Boolean(partial.accessToken) && Boolean(partial.cloudId))
      ? "oauth"
      : "basic";

  if (!partial.baseUrl) return null;
  if (authMode === "oauth") {
    if (!partial.accessToken || !partial.cloudId) return null;
  } else if (!partial.email || !partial.apiToken) {
    return null;
  }

  const rawCategory = (partial.categoryField ?? "").trim();
  const rawCustom =
    typeof partial.categoryCustomFieldId === "string"
      ? partial.categoryCustomFieldId.trim()
      : "";
  const categoryField = normalizeCategoryField(rawCategory, rawCustom);
  const categoryCustomFieldId = normalizeCustomFieldId(
    rawCustom ||
      (rawCategory.toLowerCase().startsWith("customfield_")
        ? rawCategory
        : DEFAULT_JIRA_SETTINGS.categoryCustomFieldId),
  );

  return {
    baseUrl: partial.baseUrl.replace(/\/$/, ""),
    email: partial.email?.trim() || partial.accountDisplayName || "oauth",
    apiToken: authMode === "oauth" ? "" : partial.apiToken!,
    authMode,
    accessToken: authMode === "oauth" ? partial.accessToken : undefined,
    refreshToken: authMode === "oauth" ? partial.refreshToken : undefined,
    cloudId: authMode === "oauth" ? partial.cloudId : undefined,
    tokenExpiresAt: authMode === "oauth" ? partial.tokenExpiresAt : undefined,
    accountDisplayName: partial.accountDisplayName,
    jqlBase: partial.jqlBase || DEFAULT_JIRA_SETTINGS.jqlBase,
    openStatusJql: partial.openStatusJql || DEFAULT_JIRA_SETTINGS.openStatusJql,
    datePriseEnChargeJql:
      partial.datePriseEnChargeJql ||
      DEFAULT_JIRA_SETTINGS.datePriseEnChargeJql,
    datePriseEnChargeFieldId:
      partial.datePriseEnChargeFieldId ||
      DEFAULT_JIRA_SETTINGS.datePriseEnChargeFieldId,
    slaPriseEnChargeHours:
      partial.slaPriseEnChargeHours ??
      DEFAULT_JIRA_SETTINGS.slaPriseEnChargeHours,
    slaClotureHours:
      partial.slaClotureHours ?? DEFAULT_JIRA_SETTINGS.slaClotureHours,
    categoryField,
    categoryCustomFieldId,
    connectedAt: partial.connectedAt || new Date().toISOString(),
  };
}

/** Accepte aussi un customfield_… passé directement dans categoryField (env). */
function normalizeCategoryField(
  raw: string | undefined,
  customId?: string,
): JiraConnection["categoryField"] {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "auto" || v === "automatic" || v === "detect") return "auto";
  if (v === "label" || v === "labels") return "label";
  if (v === "issuetype" || v === "type") return "issuetype";
  if (v === "component" || v === "components") return "component";
  if (v === "custom" || v.startsWith("customfield_") || /^\d+$/.test(v)) {
    return "custom";
  }
  if (
    v === "requesttype" ||
    v === "request_type" ||
    v === "request-type" ||
    v === "customer request type"
  ) {
    return "requestType";
  }
  if (customId?.trim()) return "custom";
  return "custom";
}

/** « 10152 » → « customfield_10152 » */
export function normalizeCustomFieldId(raw: string): string {
  const v = raw.trim();
  if (!v) return DEFAULT_JIRA_SETTINGS.categoryCustomFieldId;
  if (/^customfield_\d+$/i.test(v)) return v.toLowerCase();
  if (/^\d+$/.test(v)) return `customfield_${v}`;
  return v;
}

async function readCookieCipher(): Promise<string | null> {
  try {
    const jar = await cookies();
    return jar.get(JIRA_COOKIE)?.value ?? null;
  } catch {
    // Hors contexte requête (cron, scripts)
    return null;
  }
}

async function writeCookieCipher(cipher: string): Promise<void> {
  try {
    const jar = await cookies();
    jar.set(JIRA_COOKIE, cipher, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
  } catch {
    // ignore
  }
}

async function clearCookieCipher(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete(JIRA_COOKIE);
  } catch {
    // ignore
  }
}

/** Compte stocké côté navigateur (ancien mode mono-appareil). */
export async function readJiraConnection(): Promise<JiraConnection | null> {
  const raw = await readCookieCipher();
  if (!raw) return null;
  return decryptConnection(raw);
}

/**
 * Persiste email + token (chiffrés) dans Supabase pour partage multi-appareils.
 * Cookie local conservé en cache ; sans Supabase → cookie seul (dev).
 */
export async function writeJiraConnection(conn: JiraConnection): Promise<void> {
  const cipher = encryptConnection(conn);
  if (supabaseConfigured()) {
    const ok = await saveJiraCipherToSupabase(cipher);
    if (!ok) {
      console.warn(
        "KPI: échec d’écriture du compte Jira dans Supabase — cookie local uniquement.",
      );
    }
  }
  await writeCookieCipher(cipher);
}

export async function clearJiraConnection(): Promise<void> {
  if (supabaseConfigured()) {
    await clearJiraCipherFromSupabase();
  }
  await clearCookieCipher();
}

function connectionFromEnv(): JiraConnection | null {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !apiToken) return null;

  return normalizeConnection({
    baseUrl,
    email,
    apiToken,
    authMode: "basic",
    jqlBase: process.env.JIRA_JQL_BASE ?? DEFAULT_JIRA_SETTINGS.jqlBase,
    openStatusJql:
      process.env.JIRA_OPEN_STATUS_JQL ?? DEFAULT_JIRA_SETTINGS.openStatusJql,
    datePriseEnChargeJql:
      process.env.JIRA_DATE_PRISE_EN_CHARGE_JQL ??
      DEFAULT_JIRA_SETTINGS.datePriseEnChargeJql,
    datePriseEnChargeFieldId:
      process.env.JIRA_DATE_PRISE_EN_CHARGE_FIELD ??
      DEFAULT_JIRA_SETTINGS.datePriseEnChargeFieldId,
    slaPriseEnChargeHours: Number(
      process.env.JIRA_SLA_PRISE_EN_CHARGE_HOURS ??
        DEFAULT_JIRA_SETTINGS.slaPriseEnChargeHours,
    ),
    slaClotureHours: Number(
      process.env.JIRA_SLA_CLOTURE_HOURS ??
        DEFAULT_JIRA_SETTINGS.slaClotureHours,
    ),
    categoryField:
      (process.env.JIRA_CATEGORY_FIELD as JiraConnection["categoryField"]) ||
      DEFAULT_JIRA_SETTINGS.categoryField,
    categoryCustomFieldId: normalizeCustomFieldId(
      process.env.JIRA_CATEGORY_CUSTOM_FIELD ||
        (process.env.JIRA_CATEGORY_FIELD?.startsWith("customfield_")
          ? process.env.JIRA_CATEGORY_FIELD
          : /^\d+$/.test(process.env.JIRA_CATEGORY_FIELD ?? "")
            ? process.env.JIRA_CATEGORY_FIELD!
            : DEFAULT_JIRA_SETTINGS.categoryCustomFieldId),
    ),
    connectedAt: "env",
  });
}

/**
 * Ordre : Supabase (partagé) → cookie local (migration) → variables d’env.
 * Un cookie trouvé alors que Supabase est vide est migré automatiquement.
 */
export async function resolveJiraConnection(): Promise<JiraConnection | null> {
  if (supabaseConfigured()) {
    const cipher = await loadJiraCipherFromSupabase();
    if (cipher) {
      const fromSb = decryptConnection(cipher);
      if (fromSb) return fromSb;
    }
  }

  const fromCookie = await readJiraConnection();
  if (fromCookie) {
    if (supabaseConfigured()) {
      const cipher = encryptConnection(fromCookie);
      const ok = await saveJiraCipherToSupabase(cipher);
      if (ok) {
        console.info(
          "KPI: compte Jira migré du cookie navigateur vers Supabase.",
        );
      }
    }
    return fromCookie;
  }

  return connectionFromEnv();
}

/** D’où vient le compte actuellement utilisé (pour l’UI Sync Jira). */
export async function resolveJiraConnectionSource(): Promise<{
  connection: JiraConnection | null;
  source: JiraConnectionSource | null;
}> {
  if (supabaseConfigured()) {
    const cipher = await loadJiraCipherFromSupabase();
    if (cipher) {
      const fromSb = decryptConnection(cipher);
      if (fromSb) return { connection: fromSb, source: "supabase" };
    }
  }

  const fromCookie = await readJiraConnection();
  if (fromCookie) {
    return { connection: fromCookie, source: "cookie" };
  }

  const fromEnv = connectionFromEnv();
  if (fromEnv) return { connection: fromEnv, source: "env" };

  return { connection: null, source: null };
}

export function sanitizeConnection(conn: JiraConnection): {
  baseUrl: string;
  email: string;
  authMode: JiraAuthMode;
  accountDisplayName?: string;
  jqlBase: string;
  openStatusJql: string;
  datePriseEnChargeJql: string;
  datePriseEnChargeFieldId: string;
  slaPriseEnChargeHours: number;
  slaClotureHours: number;
  categoryField: JiraConnection["categoryField"];
  categoryCustomFieldId: string;
  connectedAt: string;
  hasToken: boolean;
  cloudId?: string;
} {
  return {
    baseUrl: conn.baseUrl,
    email: conn.email,
    authMode: conn.authMode ?? "basic",
    accountDisplayName: conn.accountDisplayName,
    jqlBase: conn.jqlBase,
    openStatusJql: conn.openStatusJql,
    datePriseEnChargeJql: conn.datePriseEnChargeJql,
    datePriseEnChargeFieldId: conn.datePriseEnChargeFieldId,
    slaPriseEnChargeHours: conn.slaPriseEnChargeHours,
    slaClotureHours: conn.slaClotureHours,
    categoryField: conn.categoryField,
    categoryCustomFieldId: conn.categoryCustomFieldId,
    connectedAt: conn.connectedAt,
    hasToken: conn.authMode === "oauth" ? Boolean(conn.accessToken) : true,
    cloudId: conn.cloudId,
  };
}

/** Base URL API (site direct ou gateway OAuth). */
export function jiraApiBaseUrl(conn: JiraConnection): string {
  if (conn.authMode === "oauth" && conn.cloudId) {
    return `https://api.atlassian.com/ex/jira/${conn.cloudId}`;
  }
  return conn.baseUrl.replace(/\/$/, "");
}

export function jiraAuthHeaderValue(conn: JiraConnection): string {
  if (conn.authMode === "oauth" && conn.accessToken) {
    return `Bearer ${conn.accessToken}`;
  }
  return `Basic ${Buffer.from(`${conn.email}:${conn.apiToken}`).toString("base64")}`;
}
