import type { WeeklyRow } from "./types";
import { weekId } from "./types";
import type { JiraConnection } from "./jira-auth";
import { resolveJiraConnection } from "./jira-auth";

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
  };
}

/** Bornes lundi–dimanche d'une semaine ISO */
export function isoWeekDateRange(
  year: number,
  week: number,
): { start: string; end: string } {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const ISOweekStart = simple;
  if (dow <= 4) {
    ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  } else {
    ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  }
  const start = ISOweekStart;
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

export interface WeekJqlBundle {
  created: string;
  openAtWeekEnd: string;
  slaResolutionBreached: string;
  slaFirstResponseBreached: string;
  start: string;
  end: string;
}

/**
 * JQL alignés sur KPI.xlsx pour une semaine ISO.
 *
 * - Demandes IT : tickets créés dans [lundi, dimanche]
 * - Non résolues : créés ≤ fin de semaine ET (non résolus OU résolus après la semaine)
 * - Hors SLA clôture : résolus dans la semaine avec SLA résolution breached
 * - Hors SLA prise en charge : créés dans la semaine avec SLA 1ère réponse breached
 */
export function buildWeekJql(
  conn: JiraConnection,
  year: number,
  week: number,
): WeekJqlBundle {
  const { start, end } = isoWeekDateRange(year, week);
  const base = `(${conn.jqlBase})`;
  const slaRes = escapeJqlString(conn.slaResolution);
  const slaFr = escapeJqlString(conn.slaFirstResponse);

  return {
    start,
    end,
    created: `${base} AND created >= "${start}" AND created <= "${end} 23:59"`,
    openAtWeekEnd: `${base} AND created <= "${end} 23:59" AND (resolution is EMPTY OR resolved > "${end} 23:59")`,
    slaResolutionBreached: `${base} AND resolved >= "${start}" AND resolved <= "${end} 23:59" AND "${slaRes}" = breached()`,
    slaFirstResponseBreached: `${base} AND created >= "${start}" AND created <= "${end} 23:59" AND "${slaFr}" = breached()`,
  };
}

function escapeJqlString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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

/** Compte total via search (maxResults=0) — rapide */
export async function countJql(
  conn: JiraConnection,
  jql: string,
): Promise<number> {
  const url = new URL(`${conn.baseUrl}/rest/api/3/search`);
  url.searchParams.set("jql", jql);
  url.searchParams.set("maxResults", "0");
  url.searchParams.set("fields", "summary");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: authHeader(conn),
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira count ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as { total: number };
  return data.total;
}

async function searchAll(
  conn: JiraConnection,
  jql: string,
  fields: string,
): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = [];
  let startAt = 0;
  const maxResults = 100;

  for (;;) {
    const url = new URL(`${conn.baseUrl}/rest/api/3/search`);
    url.searchParams.set("jql", jql);
    url.searchParams.set("startAt", String(startAt));
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("fields", fields);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: authHeader(conn),
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(
        `Jira search ${res.status}: ${(await res.text()).slice(0, 400)}`,
      );
    }

    const data = (await res.json()) as { issues: JiraIssue[]; total: number };
    issues.push(...data.issues);
    startAt += data.issues.length;
    if (startAt >= data.total || data.issues.length === 0) break;
  }

  return issues;
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
    const profile = (await me.json()) as { displayName?: string; emailAddress?: string };
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

export interface JiraWeekSyncResult {
  patch: Partial<WeeklyRow>;
  byType: Record<string, number>;
  byAssignee: Record<string, number>;
  jql: WeekJqlBundle;
  warnings: string[];
}

/**
 * Sync hebdo complète via JQL.
 * Les compteurs SLA tentent les champs JSM ; en cas d'échec JQL SLA → warning + null laissé.
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

  const createdIssues = await searchAll(
    connection,
    jql.created,
    "created,resolutiondate,assignee,labels,components,issuetype",
  );

  let openCount: number;
  try {
    openCount = await countJql(connection, jql.openAtWeekEnd);
  } catch (err) {
    warnings.push(
      `JQL non résolues: ${err instanceof Error ? err.message : "erreur"}`,
    );
    openCount = await countJql(
      connection,
      `(${connection.jqlBase}) AND statusCategory != Done`,
    );
    warnings.push("Fallback: stock ouvert actuel (statusCategory != Done).");
  }

  let slaCloture: number | null = null;
  let slaPriseEnCharge: number | null = null;

  try {
    slaCloture = await countJql(connection, jql.slaResolutionBreached);
  } catch (err) {
    warnings.push(
      `SLA clôture (« ${connection.slaResolution} ») indisponible: ${
        err instanceof Error ? err.message.slice(0, 120) : "erreur"
      }. Vérifiez le nom du SLA JSM.`,
    );
  }

  try {
    slaPriseEnCharge = await countJql(
      connection,
      jql.slaFirstResponseBreached,
    );
  } catch (err) {
    warnings.push(
      `SLA prise en charge (« ${connection.slaFirstResponse} ») indisponible: ${
        err instanceof Error ? err.message.slice(0, 120) : "erreur"
      }.`,
    );
  }

  const byType: Record<string, number> = {};
  const byAssignee: Record<string, number> = {};

  for (const issue of createdIssues) {
    const cat = categoryOf(issue, connection.categoryField);
    byType[cat] = (byType[cat] ?? 0) + 1;
    const who = issue.fields.assignee?.displayName ?? "Non assigné";
    byAssignee[who] = (byAssignee[who] ?? 0) + 1;
  }

  const patch: Partial<WeeklyRow> = {
    demandesItHebdo: createdIssues.length,
    demandesNonResoluesHebdo: openCount,
    jiraSyncedAt: new Date().toISOString(),
  };

  if (slaCloture !== null) patch.ticketsHorsSlaCloture = slaCloture;
  if (slaPriseEnCharge !== null) {
    patch.ticketsHorsSlaPriseEnCharge = slaPriseEnCharge;
  }

  return { patch, byType, byAssignee, jql, warnings };
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
      jqlBase: "project = IT",
      slaResolution: "Time to resolution",
      slaFirstResponse: "Time to first response",
      categoryField: "component",
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
  };
}

export function weekKey(year: number, week: number): string {
  return weekId({ year, month: 1, week });
}

/** @deprecated use resolveJiraConnection */
export async function getJiraConfig(): Promise<JiraConnection | null> {
  return resolveJiraConnection();
}
