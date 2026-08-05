import type { WeeklyRow } from "./types";
import { weekId } from "./types";
import type { JiraConnection } from "./jira-auth";
import { DEFAULT_JIRA_SETTINGS, resolveJiraConnection } from "./jira-auth";
import { countOverBusinessSla } from "./business-hours";

export type { JiraConnection };

function authHeader(conn: JiraConnection): string {
  return `Basic ${Buffer.from(`${conn.email}:${conn.apiToken}`).toString("base64")}`;
}

interface JiraUser {
  displayName?: string;
  emailAddress?: string;
  accountId?: string;
}

interface JiraIssue {
  key: string;
  fields: {
    created: string;
    resolutiondate: string | null;
    issuetype?: { name: string };
    assignee?: JiraUser | null;
    reporter?: JiraUser | null;
    creator?: JiraUser | null;
    labels?: string[];
    components?: { name: string }[];
    [custom: string]: unknown;
  };
}

/**
 * Bornes semaine ISO lundi 00:00 → lundi suivant 00:00 (exclus).
 * Équivalent Jira n8n :
 *   created >= startOfWeek(-1) AND created < startOfWeek()
 */
export function isoWeekDateRange(
  year: number,
  week: number,
): { start: string; endExclusive: string; endInclusive: string } {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const monday = simple;
  if (dow <= 4) {
    monday.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  } else {
    monday.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  }
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    start: fmt(monday),
    endExclusive: fmt(nextMonday),
    endInclusive: fmt(sunday),
  };
}

/** Semaine ISO courante (année + numéro), UTC. */
export function currentIsoWeek(date = new Date()): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** Semaine ISO précédente (celle que n8n extrait avec startOfWeek(-1)). */
export function previousIsoWeek(date = new Date()): { year: number; week: number } {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - 7);
  return currentIsoWeek(d);
}

export interface WeekJqlBundle {
  /** Demandes IT — tickets créés dans la semaine */
  created: string;
  /** Demandes non résolues — snapshot ouvert (comme n8n) */
  open: string;
  /** Candidats SLA prise en charge (Date Prise en Charge ∈ semaine) */
  priseEnCharge: string;
  /** Candidats SLA clôture (resolutiondate ∈ semaine) */
  resolved: string;
  start: string;
  endExclusive: string;
  endInclusive: string;
  /** true si JQL relatif startOfWeek(-1) / startOfWeek() */
  usedRelativeWeekFunctions: boolean;
}

function escapeJqlString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function stripOrderBy(jql: string): string {
  return jql.replace(/\s+ORDER BY\s+.+$/i, "").trim();
}

/**
 * JQL calqués sur le workflow n8n Coverseal.
 *
 * Toujours des bornes ISO absolues [lundi, lundi+7) — reproductibles pour
 * n’importe quelle semaine (outil de vérification). Équivalent à
 * startOfWeek(-1) / startOfWeek() quand on est le lundi suivant, fuseau Jira.
 */
export function buildWeekJql(
  conn: JiraConnection,
  year: number,
  week: number,
): WeekJqlBundle {
  const { start, endExclusive, endInclusive } = isoWeekDateRange(year, week);
  const base = conn.jqlBase.trim();
  const pec = escapeJqlString(conn.datePriseEnChargeJql);

  // Datetimes explicites : minuit → minuit (interprétés dans le fuseau du site Jira)
  const startDt = `${start} 00:00`;
  const endDt = `${endExclusive} 00:00`;

  return {
    start,
    endExclusive,
    endInclusive,
    usedRelativeWeekFunctions: false,
    created: `${base} AND created >= "${startDt}" AND created < "${endDt}" ORDER BY created ASC`,
    open: `${base} AND ${conn.openStatusJql} ORDER BY created ASC`,
    priseEnCharge: `${base} AND "${pec}" >= "${startDt}" AND "${pec}" < "${endDt}" ORDER BY created ASC`,
    resolved: `${base} AND resolutiondate >= "${startDt}" AND resolutiondate < "${endDt}" ORDER BY resolutiondate ASC`,
  };
}

async function jiraFetch(
  conn: JiraConnection,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${conn.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(conn),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

interface SearchJqlResponse {
  issues?: unknown[];
  nextPageToken?: string | null;
  isLast?: boolean;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function normalizeIssues(raw: unknown[] | undefined): JiraIssue[] {
  if (!raw?.length) return [];
  const out: JiraIssue[] = [];

  for (const item of raw) {
    if (typeof item === "string") {
      out.push({
        key: item,
        fields: { created: "", resolutiondate: null },
      });
      continue;
    }

    const obj = asRecord(item);
    if (!obj) continue;

    const fieldsObj = asRecord(obj.fields) ?? {};
    const key =
      (typeof obj.key === "string" && obj.key) ||
      (typeof obj.id === "string" && obj.id) ||
      (typeof fieldsObj.key === "string" && fieldsObj.key) ||
      "";

    out.push({
      key,
      fields: {
        created: typeof fieldsObj.created === "string" ? fieldsObj.created : "",
        resolutiondate:
          typeof fieldsObj.resolutiondate === "string"
            ? fieldsObj.resolutiondate
            : null,
        issuetype: fieldsObj.issuetype as JiraIssue["fields"]["issuetype"],
        assignee: fieldsObj.assignee as JiraIssue["fields"]["assignee"],
        reporter: fieldsObj.reporter as JiraIssue["fields"]["reporter"],
        creator: fieldsObj.creator as JiraIssue["fields"]["creator"],
        labels: fieldsObj.labels as string[] | undefined,
        ...fieldsObj,
        // Parse robuste après le spread (string[] ou {name}[])
        components: normalizeComponentNames(fieldsObj.components).map(
          (name) => ({ name }),
        ),
      },
    });
  }

  return out;
}

async function searchJqlPost(
  conn: JiraConnection,
  jql: string,
  fields: string[],
  nextPageToken: string | undefined,
  maxResults: number,
): Promise<{ issues: JiraIssue[]; nextPageToken?: string; status: number }> {
  const body: Record<string, unknown> = {
    jql,
    maxResults,
  };
  if (fields.length > 0) body.fields = fields;
  if (nextPageToken) body.nextPageToken = nextPageToken;

  const res = await jiraFetch(conn, "/rest/api/3/search/jql", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Jira search ${res.status}: ${text.slice(0, 400)}`);
  }

  let data: SearchJqlResponse;
  try {
    data = JSON.parse(text) as SearchJqlResponse;
  } catch {
    throw new Error(`Jira search: réponse non-JSON: ${text.slice(0, 200)}`);
  }

  const issues = normalizeIssues(data.issues);
  const token =
    data.isLast === true
      ? undefined
      : data.nextPageToken
        ? String(data.nextPageToken)
        : undefined;

  return { issues, nextPageToken: token, status: res.status };
}

async function searchJqlGet(
  conn: JiraConnection,
  jql: string,
  fields: string[],
  maxResults: number,
): Promise<{ issues: JiraIssue[]; nextPageToken?: string }> {
  const params = new URLSearchParams();
  params.set("jql", jql);
  params.set("maxResults", String(maxResults));
  if (fields.length > 0) params.set("fields", fields.join(","));

  const res = await jiraFetch(
    conn,
    `/rest/api/3/search/jql?${params.toString()}`,
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Jira search GET ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = JSON.parse(text) as SearchJqlResponse;
  const issues = normalizeIssues(data.issues);
  const token =
    data.isLast === true
      ? undefined
      : data.nextPageToken
        ? String(data.nextPageToken)
        : undefined;
  return { issues, nextPageToken: token };
}

/**
 * Nouvelle API Jira Cloud (CHANGE-2046) :
 * POST /rest/api/3/search/jql — body JSON + pagination nextPageToken.
 * Fallbacks : sans ORDER BY, puis GET, si la 1re page revient vide.
 */
async function searchJqlPage(
  conn: JiraConnection,
  jql: string,
  fields: string[],
  nextPageToken?: string,
  maxResults = 100,
): Promise<{ issues: JiraIssue[]; nextPageToken?: string }> {
  // Ne pas demander "key" dans fields — toujours renvoyé ; certains sites le rejettent
  const safeFields = fields.filter((f) => f !== "key");

  let page = await searchJqlPost(
    conn,
    jql,
    safeFields,
    nextPageToken,
    maxResults,
  );

  // Si 1re page vide, retenter sans ORDER BY (certains tenants)
  if (!nextPageToken && page.issues.length === 0 && /\bORDER BY\b/i.test(jql)) {
    page = await searchJqlPost(
      conn,
      stripOrderBy(jql),
      safeFields,
      undefined,
      maxResults,
    );
  }

  // Retenter avec *all (format documenté Atlassian / langchain fix)
  if (!nextPageToken && page.issues.length === 0) {
    try {
      page = await searchJqlPost(
        conn,
        stripOrderBy(jql),
        ["*all"],
        undefined,
        maxResults,
      );
    } catch {
      // garder le résultat précédent
    }
  }

  // Dernier recours : GET
  if (!nextPageToken && page.issues.length === 0) {
    try {
      const getPage = await searchJqlGet(
        conn,
        stripOrderBy(jql),
        safeFields,
        maxResults,
      );
      if (getPage.issues.length > 0) return getPage;
    } catch {
      // garder le résultat POST
    }
  }

  return { issues: page.issues, nextPageToken: page.nextPageToken };
}

/** Compte via approximate-count, sinon pagination exacte sur /search/jql. */
export async function countJql(
  conn: JiraConnection,
  jql: string,
): Promise<number> {
  const jqlForCount = stripOrderBy(jql);

  try {
    const res = await jiraFetch(conn, "/rest/api/3/search/approximate-count", {
      method: "POST",
      body: JSON.stringify({ jql: jqlForCount }),
    });
    if (res.ok) {
      const data = (await res.json()) as { count?: number };
      if (typeof data.count === "number" && data.count > 0) return data.count;
      // count === 0 : on vérifie quand même via search (approx peut être faux)
      if (typeof data.count === "number" && data.count === 0) {
        // fall through to exact
      } else if (typeof data.count === "number") {
        return data.count;
      }
    }
  } catch {
    // fallback ci-dessous
  }

  let count = 0;
  let nextPageToken: string | undefined;
  for (;;) {
    const page = await searchJqlPage(
      conn,
      jqlForCount,
      ["id"],
      nextPageToken,
      100,
    );
    count += page.issues.length;
    if (!page.nextPageToken || page.issues.length === 0) break;
    nextPageToken = page.nextPageToken;
  }
  return count;
}

async function searchAll(
  conn: JiraConnection,
  jql: string,
  fields: string,
): Promise<JiraIssue[]> {
  // *all garantit customfield + dates pour le calcul SLA (sinon champs parfois vides)
  const wantAll = fields.includes("*all");
  const fieldList = wantAll
    ? ["*all"]
    : [
        "summary",
        ...fields
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean),
      ];
  const fieldsUnique = [...new Set(fieldList)].filter((f) => f !== "key");

  const issues: JiraIssue[] = [];
  let nextPageToken: string | undefined;
  let pages = 0;

  for (;;) {
    const page = await searchJqlPage(
      conn,
      jql,
      fieldsUnique,
      nextPageToken,
      100,
    );
    issues.push(...page.issues);
    pages += 1;
    if (!page.nextPageToken || page.issues.length === 0 || pages > 50) break;
    nextPageToken = page.nextPageToken;
  }

  return issues;
}

export interface JiraProbeResult {
  ok: boolean;
  jql: string;
  count: number;
  sampleKeys: string[];
  error?: string;
}

/** Sonde : le projet renvoie-t-il des tickets ? */
export async function probeJiraProject(
  conn: JiraConnection,
): Promise<JiraProbeResult> {
  const jql = `${conn.jqlBase.trim()} ORDER BY created DESC`;
  try {
    const page = await searchJqlPage(
      conn,
      jql,
      ["summary", "created"],
      undefined,
      5,
    );
    const count = await countJql(conn, conn.jqlBase.trim());
    return {
      ok: page.issues.length > 0 || count > 0,
      jql,
      count: Math.max(count, page.issues.length),
      sampleKeys: page.issues.map((i) => i.key).filter(Boolean).slice(0, 5),
    };
  } catch (err) {
    return {
      ok: false,
      jql,
      count: 0,
      sampleKeys: [],
      error: err instanceof Error ? err.message : "probe failed",
    };
  }
}

export async function testJiraConnection(conn: JiraConnection): Promise<{
  ok: boolean;
  displayName?: string;
  site?: string;
  error?: string;
}> {
  try {
    const me = await jiraFetch(conn, "/rest/api/3/myself");
    if (!me.ok) {
      return {
        ok: false,
        error: `Auth échouée (${me.status}). Vérifiez email + API token.`,
      };
    }
    const profile = (await me.json()) as {
      displayName?: string;
      emailAddress?: string;
    };
    return {
      ok: true,
      displayName: profile.displayName ?? profile.emailAddress,
      site: conn.baseUrl,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur réseau Jira",
    };
  }
}

function personName(user: JiraUser | null | undefined, fallback: string): string {
  if (!user) return fallback;
  const name =
    user.displayName?.trim() ||
    user.emailAddress?.trim() ||
    user.accountId?.trim();
  return name || fallback;
}

function normalizeComponentNames(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const names: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      names.push(item.trim());
      continue;
    }
    const obj = asRecord(item);
    if (!obj) continue;
    const name =
      (typeof obj.name === "string" && obj.name.trim()) ||
      (typeof obj.value === "string" && obj.value.trim()) ||
      "";
    if (name) names.push(name);
  }
  return names;
}

function customFieldCategoryValue(
  issue: JiraIssue,
  fieldId: string,
): string | null {
  if (!fieldId) return null;
  const raw = issue.fields[fieldId];
  if (raw == null || raw === "") return null;
  if (typeof raw === "string") {
    // Souvent "portalKey/requestTypeKey" — on garde la partie affichable
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.includes("/")) {
      const tail = trimmed.split("/").pop()?.trim();
      return tail || trimmed;
    }
    return trimmed;
  }
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) {
    const parts = raw
      .map((item) => {
        if (typeof item === "string") return item.trim();
        const obj = asRecord(item);
        if (!obj) return "";
        return (
          (typeof obj.value === "string" && obj.value.trim()) ||
          (typeof obj.name === "string" && obj.name.trim()) ||
          (typeof obj.label === "string" && obj.label.trim()) ||
          ""
        );
      })
      .filter(Boolean);
    return parts[0] ?? null;
  }
  const obj = asRecord(raw);
  if (!obj) return null;
  // JSM Customer Request Type : { requestType: { name: "Odoo", ... }, ... }
  const requestType = asRecord(obj.requestType);
  if (requestType) {
    if (typeof requestType.name === "string" && requestType.name.trim()) {
      return requestType.name.trim();
    }
  }
  if (typeof obj.value === "string" && obj.value.trim()) return obj.value.trim();
  if (typeof obj.name === "string" && obj.name.trim()) return obj.name.trim();
  if (typeof obj.label === "string" && obj.label.trim()) return obj.label.trim();
  const child = asRecord(obj.child);
  if (child && typeof child.value === "string" && child.value.trim()) {
    return child.value.trim();
  }
  return null;
}

/**
 * Trouve le Customer Request Type JSM sur une issue (*all fields).
 * Champ typique : customfield_XXXX = { requestType: { name: "Odoo" } }
 */
export function findRequestTypeName(
  issue: JiraIssue,
  preferredFieldId?: string,
): string | null {
  if (preferredFieldId) {
    const direct = customFieldCategoryValue(issue, preferredFieldId);
    if (direct) return direct;
  }
  for (const [key, raw] of Object.entries(issue.fields)) {
    if (!key.startsWith("customfield_")) continue;
    const obj = asRecord(raw);
    if (!obj) continue;
    const rt = asRecord(obj.requestType);
    if (rt && typeof rt.name === "string" && rt.name.trim()) {
      return rt.name.trim();
    }
  }
  return null;
}

export function categoryOf(
  issue: JiraIssue,
  connection: Pick<JiraConnection, "categoryField" | "categoryCustomFieldId">,
): string {
  const field = connection.categoryField;
  if (field === "issuetype") {
    return issue.fields.issuetype?.name?.trim() || "Non catégorisé";
  }
  if (field === "label") {
    const labels = issue.fields.labels;
    const first =
      Array.isArray(labels) && typeof labels[0] === "string"
        ? labels[0].trim()
        : "";
    return first || "Non catégorisé";
  }
  if (field === "custom" || field === "auto") {
    // auto : categoryCustomFieldId est rempli après détection
    if (connection.categoryCustomFieldId) {
      return (
        customFieldCategoryValue(issue, connection.categoryCustomFieldId) ||
        "Non catégorisé"
      );
    }
    if (field === "auto") {
      return (
        findRequestTypeName(issue) ||
        normalizeComponentNames(issue.fields.components)[0] ||
        "Non catégorisé"
      );
    }
    return "Non catégorisé";
  }
  if (field === "requestType") {
    return (
      findRequestTypeName(issue, connection.categoryCustomFieldId) ||
      "Non catégorisé"
    );
  }
  const components = normalizeComponentNames(issue.fields.components);
  if (components[0]) return components[0];
  return (
    findRequestTypeName(issue, connection.categoryCustomFieldId) ||
    "Non catégorisé"
  );
}

async function fetchJiraFieldNames(
  conn: JiraConnection,
): Promise<Record<string, string>> {
  try {
    const res = await jiraFetch(conn, "/rest/api/3/field");
    if (!res.ok) return {};
    const data = (await res.json()) as Array<{ id?: string; name?: string }>;
    const map: Record<string, string> = {};
    for (const f of data) {
      if (f.id && f.name) map[f.id] = f.name;
    }
    return map;
  } catch {
    return {};
  }
}

/** Résout la vraie source de catégorie IT (évite le Request Type « mail »). */
async function resolveCategorySource(
  connection: JiraConnection,
  issues: JiraIssue[],
  warnings: string[],
): Promise<Pick<JiraConnection, "categoryField" | "categoryCustomFieldId">> {
  const {
    discoverItCategoryField,
    resolveCategoryConnection,
    isChannelLikeCategory,
  } = await import("./jira-category-detect");

  const fieldNames = await fetchJiraFieldNames(connection);
  const discovered = discoverItCategoryField(
    issues,
    (issue, fieldId) =>
      customFieldCategoryValue(issue as JiraIssue, fieldId),
    fieldNames,
  );

  const resolved = resolveCategoryConnection(connection, discovered);

  if (resolved.usedDiscovery && discovered) {
    warnings.push(
      `Catégories IT via ${discovered.fieldId}` +
        (discovered.fieldName ? ` « ${discovered.fieldName} »` : "") +
        ` — ex. ${discovered.distinctValues.slice(0, 6).join(", ") || "—"}.`,
    );
    return {
      categoryField: "custom",
      categoryCustomFieldId: discovered.fieldId,
    };
  }

  // requestType seul mais valeurs = canal mail → prévenir + lister candidats
  if (
    connection.categoryField === "requestType" ||
    connection.categoryField === "auto" ||
    connection.categoryField === "component"
  ) {
    const samples = issues
      .slice(0, 8)
      .map((i) => findRequestTypeName(i))
      .filter((v): v is string => Boolean(v));
    const allChannel =
      samples.length > 0 && samples.every(isChannelLikeCategory);
    if (allChannel && !discovered) {
      const { listCategoryFieldCandidates } = await import(
        "./jira-category-detect"
      );
      const candidates = listCategoryFieldCandidates(
        issues,
        (issue, fieldId) =>
          customFieldCategoryValue(issue as JiraIssue, fieldId),
        fieldNames,
      );
      warnings.push(
        `Request Type JSM = canal (${samples[0]}) — pas Elfsquad/Odoo/matériel.` +
          (candidates.length
            ? ` Autres champs vus: ${candidates.join(" · ")}.`
            : ` Aucun autre customfield rempli sur ces tickets — la catégorie IT est peut‑être vide côté Jira.`) +
          ` Sinon: source « Champ custom » + ID customfield_…`,
      );
    }
  }

  return {
    categoryField: resolved.categoryField,
    categoryCustomFieldId: resolved.categoryCustomFieldId,
  };
}

/** Échantillon pour diagnostiquer une sync 100 % « Non catégorisé ». */
function categoryProbeSample(
  issues: JiraIssue[],
  connection: JiraConnection,
): string {
  const sample = issues.slice(0, 3).map((issue) => {
    const comps = normalizeComponentNames(issue.fields.components);
    const labels = Array.isArray(issue.fields.labels)
      ? issue.fields.labels.filter((l): l is string => typeof l === "string")
      : [];
    const req = findRequestTypeName(issue, connection.categoryCustomFieldId);
    const custom = connection.categoryCustomFieldId
      ? customFieldCategoryValue(issue, connection.categoryCustomFieldId)
      : null;
    // Aperçu d’autres customfields qui ressemblent à des catégories IT
    const itHints: string[] = [];
    for (const [key, raw] of Object.entries(issue.fields)) {
      if (!key.startsWith("customfield_")) continue;
      if (key === connection.categoryCustomFieldId) continue;
      const obj = asRecord(raw);
      if (obj?.requestType) continue;
      const val = customFieldCategoryValue(issue, key);
      if (val && matchesKnownItCategoryInline(val)) {
        itHints.push(`${key}=${val}`);
      }
    }
    return `${issue.key || "?"}[comp=${comps.join("|") || "∅"} label=${labels[0] || "∅"} req=${req || "∅"} type=${issue.fields.issuetype?.name || "∅"}${custom != null ? ` custom=${custom}` : ""}${itHints.length ? ` it:${itHints.slice(0, 2).join(",")}` : ""}]`;
  });
  return sample.join(" · ");
}

function matchesKnownItCategoryInline(name: string): boolean {
  const n = name.trim().toLowerCase();
  return [
    "elfsquad",
    "odoo",
    "matériel",
    "materiel",
    "website",
    "site internet",
    "outlook",
    "teams",
    "vplan",
    "automatisation",
  ].some((k) => n.includes(k));
}

function customFieldValue(
  issue: JiraIssue,
  fieldId: string,
): string | null {
  const raw = issue.fields[fieldId];
  if (raw == null) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "value" in raw) {
    const v = (raw as { value: unknown }).value;
    return typeof v === "string" ? v : null;
  }
  return String(raw);
}

export interface JiraWeekSyncResult {
  patch: Partial<WeeklyRow>;
  byType: Record<string, number>;
  byAssignee: Record<string, number>;
  byRequester: Record<string, number>;
  jql: WeekJqlBundle;
  warnings: string[];
  probe: JiraProbeResult;
  diagnostics: {
    createdCount: number;
    openCount: number;
    pecCandidates: number;
    resolvedCandidates: number;
    sampleCreatedKeys: string[];
  };
}

/**
 * Sync hebdo — mêmes règles que le workflow n8n Coverseal.
 */
export async function fetchJiraWeekStats(
  year: number,
  week: number,
  conn?: JiraConnection | null,
): Promise<JiraWeekSyncResult> {
  const connection = conn ?? (await resolveJiraConnection());
  if (!connection) {
    throw new Error(
      "Aucun compte Jira connecté. Connectez-vous depuis la page Sync Jira.",
    );
  }

  const jql = buildWeekJql(connection, year, week);
  const warnings: string[] = [];
  const pecField = connection.datePriseEnChargeFieldId;

  // Sonde d'abord : si le projet est vide côté API, le problème n'est pas la semaine
  const probe = await probeJiraProject(connection);
  if (!probe.ok) {
    warnings.push(
      probe.error
        ? `Sonde projet échouée: ${probe.error}`
        : `Aucun ticket trouvé pour « ${connection.jqlBase} ». Vérifiez le projet (ex. project = CSD) et reconnectez-vous.`,
    );
  } else {
    warnings.push(
      `Sonde OK: ~${probe.count} ticket(s) pour « ${connection.jqlBase} »` +
        (probe.sampleKeys.length
          ? ` (ex. ${probe.sampleKeys.join(", ")})`
          : ""),
    );
  }

  // Compteurs d'abord (approximate-count) — plus fiable que search/jql
  // qui renvoie parfois issues:[] (bug connu Atlassian / mauvais format).
  // *all pour les créés : components/labels/custom parfois absents avec liste courte.
  const [createdCountApprox, openCount, createdIssues, pecIssues, resolvedIssues] =
    await Promise.all([
      countJql(connection, jql.created),
      countJql(connection, jql.open),
      searchAll(connection, jql.created, "*all").catch((err: Error) => {
        warnings.push(`Search créés (*all): ${err.message.slice(0, 160)}`);
        return [] as JiraIssue[];
      }),
      searchAll(connection, jql.priseEnCharge, "*all").catch((err: Error) => {
        warnings.push(
          `JQL Date Prise en Charge: ${err.message.slice(0, 160)}`,
        );
        return [] as JiraIssue[];
      }),
      searchAll(connection, jql.resolved, "*all").catch((err: Error) => {
        warnings.push(`JQL resolutiondate: ${err.message.slice(0, 160)}`);
        return [] as JiraIssue[];
      }),
    ]);

  let createdForBreakdown = createdIssues;
  if (createdForBreakdown.length === 0) {
    createdForBreakdown = await searchAll(
      connection,
      jql.created,
      "created,resolutiondate,assignee,reporter,labels,components,issuetype" +
        (connection.categoryCustomFieldId
          ? `,${connection.categoryCustomFieldId}`
          : ""),
    ).catch((err: Error) => {
      warnings.push(`Search créés (fields): ${err.message.slice(0, 160)}`);
      return [] as JiraIssue[];
    });
  }

  // Compteur créés : pagination exacte si complète, sinon approximate-count
  let createdCount = createdForBreakdown.length;
  if (createdForBreakdown.length === 0 && createdCountApprox > 0) {
    createdCount = createdCountApprox;
    warnings.push(
      `Search/jql a renvoyé 0 issue mais approximate-count = ${createdCountApprox}. Compteur KPI utilisé ; répartition type/assigné indisponible.`,
    );
  } else if (
    createdCountApprox > createdForBreakdown.length &&
    createdForBreakdown.length > 0
  ) {
    // Pagination probablement tronquée
    createdCount = createdCountApprox;
    warnings.push(
      `Pagination search (${createdForBreakdown.length}) < approximate-count (${createdCountApprox}) — compteur approx utilisé.`,
    );
  }

  if (probe.ok && createdCount === 0) {
    warnings.push(
      `Le projet répond (~${probe.count} tickets) mais 0 créé sur la semaine ${year}-S${String(week).padStart(2, "0")} (${jql.start} → ${jql.endExclusive}). JQL: ${stripOrderBy(jql.created)}`,
    );
  }

  if (pecIssues.length === 0) {
    const pecCount = await countJql(connection, jql.priseEnCharge).catch(
      () => 0,
    );
    if (pecCount > 0) {
      warnings.push(
        `${pecCount} ticket(s) avec Date Prise en Charge cette semaine, mais détails absents — SLA prise en charge non calculable.`,
      );
    }
  }
  if (resolvedIssues.length === 0) {
    const resolvedCount = await countJql(connection, jql.resolved).catch(
      () => 0,
    );
    if (resolvedCount > 0) {
      warnings.push(
        `${resolvedCount} ticket(s) résolus cette semaine, mais détails absents — SLA clôture non calculable.`,
      );
    }
  }

  const slaPriseEnCharge = countOverBusinessSla(
    pecIssues.map((i) => ({
      created: i.fields.created,
      eventDate: customFieldValue(i, pecField),
    })),
    connection.slaPriseEnChargeHours,
  );

  const slaCloture = countOverBusinessSla(
    resolvedIssues.map((i) => ({
      created: i.fields.created,
      eventDate: i.fields.resolutiondate,
    })),
    connection.slaClotureHours,
  );

  const byType: Record<string, number> = {};
  const byAssignee: Record<string, number> = {};
  const byRequester: Record<string, number> = {};
  const categorySource = await resolveCategorySource(
    connection,
    createdForBreakdown,
    warnings,
  );
  for (const issue of createdForBreakdown) {
    const cat = categoryOf(issue, categorySource);
    byType[cat] = (byType[cat] ?? 0) + 1;
    const who = personName(issue.fields.assignee, "Non assigné");
    byAssignee[who] = (byAssignee[who] ?? 0) + 1;
    const requester = personName(
      issue.fields.reporter ?? issue.fields.creator,
      "Inconnu",
    );
    byRequester[requester] = (byRequester[requester] ?? 0) + 1;
  }

  if (
    createdForBreakdown.length > 0 &&
    Object.keys(byType).length === 1 &&
    byType["Non catégorisé"]
  ) {
    warnings.push(
      `Tous les tickets sont « Non catégorisé » (source=${categorySource.categoryField}` +
        (categorySource.categoryCustomFieldId
          ? `/${categorySource.categoryCustomFieldId}`
          : "") +
        `). Échantillon: ${categoryProbeSample(createdForBreakdown, { ...connection, ...categorySource })}. ` +
        `Changez la source de catégorie (champ custom IT) puis reconnectez.`,
    );
  }

  warnings.push(
    "SLA calculées en heures ouvrées Europe/Brussels (week-ends + fériés BE exclus), seuil 24h / 48h.",
  );

  return {
    patch: {
      demandesItHebdo: createdCount,
      demandesNonResoluesHebdo: openCount,
      ticketsHorsSlaPriseEnCharge: slaPriseEnCharge,
      ticketsHorsSlaCloture: slaCloture,
      jiraSyncedAt: new Date().toISOString(),
    },
    byType,
    byAssignee,
    byRequester,
    jql,
    warnings,
    probe,
    diagnostics: {
      createdCount,
      openCount,
      pecCandidates: pecIssues.length,
      resolvedCandidates: resolvedIssues.length,
      sampleCreatedKeys: createdForBreakdown
        .map((i) => i.key)
        .filter(Boolean)
        .slice(0, 8),
    },
  };
}

export function mockJiraWeekStats(
  year: number,
  week: number,
): JiraWeekSyncResult {
  const seed = year + week * 17;
  const created = 20 + (seed % 35);
  const open = 30 + (seed % 50);
  const jql = buildWeekJql(
    {
      baseUrl: "https://example.atlassian.net",
      email: "demo@example.com",
      apiToken: "x",
      ...DEFAULT_JIRA_SETTINGS,
      connectedAt: new Date().toISOString(),
    },
    year,
    week,
  );

  return {
    patch: {
      demandesItHebdo: created,
      demandesNonResoluesHebdo: open,
      ticketsHorsSlaCloture: seed % 8,
      ticketsHorsSlaPriseEnCharge: seed % 5,
      jiraSyncedAt: new Date().toISOString(),
    },
    byType: {
      Odoo: Math.round(created * 0.35),
      Elfsquad: Math.round(created * 0.2),
      Teams: Math.round(created * 0.1),
      "Non catégorisé": Math.round(created * 0.15),
      Extract: Math.round(created * 0.1),
      Outlook: Math.max(0, created - Math.round(created * 0.9)),
    },
    byAssignee: {
      "Gary Schreurs": Math.round(created * 0.4),
      "Loic Voumard": Math.round(created * 0.3),
      "Devits Quentin": Math.round(created * 0.25),
      "Dominique Kudas": Math.max(0, created - Math.round(created * 0.95)),
    },
    byRequester: {
      "Alice Martin": Math.round(created * 0.3),
      "Bruno Dupont": Math.round(created * 0.25),
      "Claire Leroy": Math.round(created * 0.2),
      "David Nguyen": Math.round(created * 0.15),
      Autre: Math.max(0, created - Math.round(created * 0.9)),
    },
    jql,
    warnings: ["Mode démo — données fictives"],
    probe: {
      ok: true,
      jql: "project = CSD",
      count: 999,
      sampleKeys: ["CSD-1", "CSD-2"],
    },
    diagnostics: {
      createdCount: created,
      openCount: open,
      pecCandidates: seed % 10,
      resolvedCandidates: seed % 12,
      sampleCreatedKeys: ["CSD-100", "CSD-101"],
    },
  };
}

export function weekKey(year: number, week: number): string {
  return weekId({ year, month: 1, week });
}

export interface CreatedBreakdownResult {
  byType: Record<string, number>;
  byAssignee: Record<string, number>;
  byRequester: Record<string, number>;
  createdCount: number;
  jql: WeekJqlBundle;
  warnings: string[];
  sampleCreatedKeys: string[];
}

/**
 * Sync légère : uniquement les tickets créés de la semaine
 * (type / assigné / demandeur). Pas de SLA ni de snapshot open.
 */
export async function fetchJiraCreatedBreakdown(
  year: number,
  week: number,
  conn?: JiraConnection | null,
): Promise<CreatedBreakdownResult> {
  const connection = conn ?? (await resolveJiraConnection());
  if (!connection) {
    throw new Error(
      "Aucun compte Jira connecté. Connectez-vous depuis la page Sync Jira.",
    );
  }

  const jql = buildWeekJql(connection, year, week);
  const warnings: string[] = [];
  // *all : plus fiable que la liste de champs (sinon assignee/reporter parfois absents)
  let createdIssues = await searchAll(connection, jql.created, "*all").catch(
    (err: Error) => {
      warnings.push(`Search créés (*all): ${err.message.slice(0, 160)}`);
      return [] as JiraIssue[];
    },
  );
  if (createdIssues.length === 0) {
    createdIssues = await searchAll(
      connection,
      jql.created,
      "created,assignee,reporter,creator,labels,components,issuetype",
    ).catch((err: Error) => {
      warnings.push(`Search créés (fields): ${err.message.slice(0, 160)}`);
      return [] as JiraIssue[];
    });
  }

  const approx = await countJql(connection, jql.created).catch(() => 0);
  let createdCount = createdIssues.length;
  if (createdIssues.length === 0 && approx > 0) {
    createdCount = approx;
    warnings.push(
      `Search/jql a renvoyé 0 issue mais approximate-count = ${approx}. Répartition type/assigné/demandeur indisponible.`,
    );
  } else if (approx > createdIssues.length && createdIssues.length > 0) {
    createdCount = approx;
    warnings.push(
      `Pagination search (${createdIssues.length}) < approximate-count (${approx}).`,
    );
  }

  const byType: Record<string, number> = {};
  const byAssignee: Record<string, number> = {};
  const byRequester: Record<string, number> = {};
  const categorySource = await resolveCategorySource(
    connection,
    createdIssues,
    warnings,
  );
  for (const issue of createdIssues) {
    const cat = categoryOf(issue, categorySource);
    byType[cat] = (byType[cat] ?? 0) + 1;
    const who = personName(issue.fields.assignee, "Non assigné");
    byAssignee[who] = (byAssignee[who] ?? 0) + 1;
    const requester = personName(
      issue.fields.reporter ?? issue.fields.creator,
      "Inconnu",
    );
    byRequester[requester] = (byRequester[requester] ?? 0) + 1;
  }

  if (
    createdIssues.length > 0 &&
    Object.keys(byAssignee).length === 1 &&
    byAssignee["Non assigné"]
  ) {
    warnings.push(
      "Tous les tickets sont « Non assigné » — vérifiez le champ assignee dans Jira.",
    );
  }

  if (
    createdIssues.length > 0 &&
    Object.keys(byType).length === 1 &&
    byType["Non catégorisé"]
  ) {
    warnings.push(
      `Tous les tickets sont « Non catégorisé » (source=${categorySource.categoryField}` +
        (categorySource.categoryCustomFieldId
          ? `/${categorySource.categoryCustomFieldId}`
          : "") +
        `). Échantillon: ${categoryProbeSample(createdIssues, { ...connection, ...categorySource })}. ` +
        `Indiquez le customfield des catégories IT puis reconnectez.`,
    );
  }

  // Si on n’a que des request types de canal, le dire clairement
  const { isChannelLikeCategory } = await import("./jira-category-detect");
  const typeKeys = Object.keys(byType);
  if (
    typeKeys.length > 0 &&
    typeKeys.every((k) => k === "Non catégorisé" || isChannelLikeCategory(k))
  ) {
    warnings.push(
      `Types obtenus = canal JSM (${typeKeys.join(", ")}), pas Elfsquad/Odoo/matériel. ` +
        `Utilisez source « Auto » ou « Champ custom » avec l’ID du champ Catégorie.`,
    );
  }

  return {
    byType,
    byAssignee,
    byRequester,
    createdCount,
    jql,
    warnings,
    sampleCreatedKeys: createdIssues
      .map((i) => i.key)
      .filter(Boolean)
      .slice(0, 8),
  };
}

export function mockCreatedBreakdown(
  year: number,
  week: number,
): CreatedBreakdownResult {
  const mock = mockJiraWeekStats(year, week);
  return {
    byType: mock.byType,
    byAssignee: mock.byAssignee,
    byRequester: mock.byRequester,
    createdCount: mock.patch.demandesItHebdo ?? 0,
    jql: mock.jql,
    warnings: ["Mode démo — demandeurs fictifs"],
    sampleCreatedKeys: mock.diagnostics.sampleCreatedKeys,
  };
}

export async function getJiraConfig(): Promise<JiraConnection | null> {
  return resolveJiraConnection();
}
