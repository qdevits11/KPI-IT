import type { WeeklyRow } from "./types";
import { weekId } from "./types";
import type { JiraConnection } from "./jira-auth";
import { DEFAULT_JIRA_SETTINGS, resolveJiraConnection } from "./jira-auth";
import { countOverBusinessSla } from "./business-hours";

export type { JiraConnection };

function authHeader(conn: JiraConnection): string {
  return `Basic ${Buffer.from(`${conn.email}:${conn.apiToken}`).toString("base64")}`;
}

interface JiraIssue {
  key: string;
  fields: {
    created: string;
    resolutiondate: string | null;
    issuetype?: { name: string };
    assignee?: { displayName: string } | null;
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
  _now = new Date(),
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
        labels: fieldsObj.labels as string[] | undefined,
        components: fieldsObj.components as { name: string }[] | undefined,
        ...fieldsObj,
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

function categoryOf(
  issue: JiraIssue,
  field: JiraConnection["categoryField"],
): string {
  if (field === "issuetype") {
    return issue.fields.issuetype?.name ?? "Non catégorisé";
  }
  if (field === "label") {
    return issue.fields.labels?.[0] ?? "Non catégorisé";
  }
  return issue.fields.components?.[0]?.name ?? "Non catégorisé";
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
  const [createdCountApprox, openCount, createdIssues, pecIssues, resolvedIssues] =
    await Promise.all([
      countJql(connection, jql.created),
      countJql(connection, jql.open),
      searchAll(
        connection,
        jql.created,
        "created,resolutiondate,assignee,labels,components,issuetype",
      ).catch((err: Error) => {
        warnings.push(`Search créés: ${err.message.slice(0, 160)}`);
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

  // Compteur créés : pagination exacte si complète, sinon approximate-count
  let createdCount = createdIssues.length;
  if (createdIssues.length === 0 && createdCountApprox > 0) {
    createdCount = createdCountApprox;
    warnings.push(
      `Search/jql a renvoyé 0 issue mais approximate-count = ${createdCountApprox}. Compteur KPI utilisé ; répartition type/assigné indisponible.`,
    );
  } else if (
    createdCountApprox > createdIssues.length &&
    createdIssues.length > 0
  ) {
    // Pagination probablement tronquée
    createdCount = createdCountApprox;
    warnings.push(
      `Pagination search (${createdIssues.length}) < approximate-count (${createdCountApprox}) — compteur approx utilisé.`,
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
  for (const issue of createdIssues) {
    const cat = categoryOf(issue, connection.categoryField);
    byType[cat] = (byType[cat] ?? 0) + 1;
    const who = issue.fields.assignee?.displayName ?? "Non assigné";
    byAssignee[who] = (byAssignee[who] ?? 0) + 1;
  }

  warnings.push(
    "Non résolues = snapshot actuel (comme n8n au moment de la sync), pas le stock Excel de fin de semaine historique.",
  );
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
    jql,
    warnings,
    probe,
    diagnostics: {
      createdCount,
      openCount,
      pecCandidates: pecIssues.length,
      resolvedCandidates: resolvedIssues.length,
      sampleCreatedKeys: createdIssues
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

export async function getJiraConfig(): Promise<JiraConnection | null> {
  return resolveJiraConnection();
}
