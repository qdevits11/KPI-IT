import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";

export const JIRA_COOKIE = "kpi_jira_session";

export interface JiraConnection {
  baseUrl: string;
  email: string;
  apiToken: string;
  /** Filtre JQL de base, ex. project = IT OR project = SUPPORT */
  jqlBase: string;
  /** Nom du SLA Jira Service Management pour la clôture */
  slaResolution: string;
  /** Nom du SLA pour la prise en charge */
  slaFirstResponse: string;
  /** Champ catégorie : component | label | issuetype */
  categoryField: "component" | "label" | "issuetype";
  connectedAt: string;
}

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
    return JSON.parse(dec.toString("utf-8")) as JiraConnection;
  } catch {
    return null;
  }
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
    maxAge: 60 * 60 * 24 * 90, // 90 jours
  });
}

export async function clearJiraConnection(): Promise<void> {
  const jar = await cookies();
  jar.delete(JIRA_COOKIE);
}

/** Config effective : cookie utilisateur prioritaire, sinon variables d'env */
export async function resolveJiraConnection(): Promise<JiraConnection | null> {
  const fromCookie = await readJiraConnection();
  if (fromCookie) return fromCookie;

  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !apiToken) return null;

  return {
    baseUrl,
    email,
    apiToken,
    jqlBase: process.env.JIRA_JQL_BASE ?? "project is not EMPTY",
    slaResolution: process.env.JIRA_SLA_RESOLUTION ?? "Time to resolution",
    slaFirstResponse:
      process.env.JIRA_SLA_FIRST_RESPONSE ?? "Time to first response",
    categoryField:
      (process.env.JIRA_CATEGORY_FIELD as JiraConnection["categoryField"]) ||
      "component",
    connectedAt: "env",
  };
}

export function sanitizeConnection(
  conn: JiraConnection,
): Omit<JiraConnection, "apiToken"> & { hasToken: boolean } {
  return {
    baseUrl: conn.baseUrl,
    email: conn.email,
    jqlBase: conn.jqlBase,
    slaResolution: conn.slaResolution,
    slaFirstResponse: conn.slaFirstResponse,
    categoryField: conn.categoryField,
    connectedAt: conn.connectedAt,
    hasToken: true,
  };
}
