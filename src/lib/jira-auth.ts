import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";

export const JIRA_COOKIE = "kpi_jira_session";

export interface JiraConnection {
  baseUrl: string;
  email: string;
  apiToken: string;
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
   * - requestType : Customer Request Type JSM (recommandé Coverseal/CSD)
   * - component | label | issuetype
   * - custom → lit categoryCustomFieldId (ex. customfield_10001)
   */
  categoryField: "requestType" | "component" | "label" | "issuetype" | "custom";
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
  /** CSD = Jira Service Management : catégories = Request Types, pas les composants */
  categoryField: "requestType" as const,
  categoryCustomFieldId: "",
};

function secretKey(): Buffer {
  const raw =
    process.env.JIRA_COOKIE_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JIRA_API_TOKEN ||
    "kpi-it-dev-secret-change-me";
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
function normalizeConnection(
  partial: Partial<JiraConnection> & {
    slaResolution?: string;
    slaFirstResponse?: string;
  },
): JiraConnection | null {
  if (!partial.baseUrl || !partial.email || !partial.apiToken) return null;

  const rawCategory = (partial.categoryField ?? "").trim();
  const rawCustom =
    typeof partial.categoryCustomFieldId === "string"
      ? partial.categoryCustomFieldId.trim()
      : "";
  const categoryField = normalizeCategoryField(rawCategory, rawCustom);
  const categoryCustomFieldId =
    rawCustom ||
    (rawCategory.toLowerCase().startsWith("customfield_")
      ? rawCategory
      : DEFAULT_JIRA_SETTINGS.categoryCustomFieldId);

  return {
    baseUrl: partial.baseUrl.replace(/\/$/, ""),
    email: partial.email,
    apiToken: partial.apiToken,
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
  if (v === "label" || v === "labels") return "label";
  if (v === "issuetype" || v === "type") return "issuetype";
  if (v === "component" || v === "components") return "component";
  if (v === "custom" || v.startsWith("customfield_")) return "custom";
  if (
    v === "requesttype" ||
    v === "request_type" ||
    v === "request-type" ||
    v === "customer request type"
  ) {
    return "requestType";
  }
  if (customId?.trim().toLowerCase().startsWith("customfield_")) return "custom";
  // Défaut Coverseal / JSM
  if (!v) return "requestType";
  return "requestType";
}

export async function readJiraConnection(): Promise<JiraConnection | null> {
  const jar = await cookies();
  const raw = jar.get(JIRA_COOKIE)?.value;
  if (!raw) return null;
  return decryptConnection(raw);
}

export async function writeJiraConnection(conn: JiraConnection): Promise<void> {
  const jar = await cookies();
  jar.set(JIRA_COOKIE, encryptConnection(conn), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}

export async function clearJiraConnection(): Promise<void> {
  const jar = await cookies();
  jar.delete(JIRA_COOKIE);
}

export async function resolveJiraConnection(): Promise<JiraConnection | null> {
  const fromCookie = await readJiraConnection();
  if (fromCookie) return fromCookie;

  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !apiToken) return null;

  return normalizeConnection({
    baseUrl,
    email,
    apiToken,
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
    categoryCustomFieldId:
      process.env.JIRA_CATEGORY_CUSTOM_FIELD ||
      (process.env.JIRA_CATEGORY_FIELD?.startsWith("customfield_")
        ? process.env.JIRA_CATEGORY_FIELD
        : DEFAULT_JIRA_SETTINGS.categoryCustomFieldId),
    connectedAt: "env",
  });
}

export function sanitizeConnection(
  conn: JiraConnection,
): Omit<JiraConnection, "apiToken"> & { hasToken: boolean } {
  return {
    baseUrl: conn.baseUrl,
    email: conn.email,
    jqlBase: conn.jqlBase,
    openStatusJql: conn.openStatusJql,
    datePriseEnChargeJql: conn.datePriseEnChargeJql,
    datePriseEnChargeFieldId: conn.datePriseEnChargeFieldId,
    slaPriseEnChargeHours: conn.slaPriseEnChargeHours,
    slaClotureHours: conn.slaClotureHours,
    categoryField: conn.categoryField,
    categoryCustomFieldId: conn.categoryCustomFieldId,
    connectedAt: conn.connectedAt,
    hasToken: true,
  };
}
