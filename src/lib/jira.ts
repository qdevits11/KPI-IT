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

/**
 * JQL calqués sur le workflow n8n Coverseal.
 *
 * Demandes IT (n8n) :
 *   project = CSD
 *   AND created >= startOfWeek(-1)
 *   AND created < startOfWeek()
 *
 * Pour la semaine précédente → fonctions relatives Jira (fuseau Jira = n8n).
 * Pour une autre semaine → dates absolues équivalentes [lundi, lundi+7).
 */
export function buildWeekJql(
  conn: JiraConnection,
  year: number,
  week: number,
  now = new Date(),
): WeekJqlBundle {
  const { start, endExclusive, endInclusive } = isoWeekDateRange(year, week);
  const base = `(${conn.jqlBase})`;
  const pec = escapeJqlString(conn.datePriseEnChargeJql);
  const prev = previousIsoWeek(now);
  const useRelative = prev.year === year && prev.week === week;

  if (useRelative) {
    return {
      start,
      endExclusive,
      endInclusive,
      usedRelativeWeekFunctions: true,
      created: `${base} AND created >= startOfWeek(-1) AND created < startOfWeek()`,
      open: `${base} AND ${conn.openStatusJql}`,
      priseEnCharge: `${base} AND "${pec}" >= startOfWeek(-1) AND "${pec}" < startOfWeek()`,
      resolved: `${base} AND resolutiondate >= startOfWeek(-1) AND resolutiondate < startOfWeek()`,
    };
  }

  return {
    start,
    endExclusive,
    endInclusive,
    usedRelativeWeekFunctions: false,
    created: `${base} AND created >= "${start}" AND created < "${endExclusive}"`,
    open: `${base} AND ${conn.openStatusJql}`,
    priseEnCharge: `${base} AND "${pec}" >= "${start}" AND "${pec}" < "${endExclusive}"`,
    resolved: `${base} AND resolutiondate >= "${start}" AND resolutiondate < "${endExclusive}"`,
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
    throw new Error(`Jira count ${res.status}: ${(await res.text()).slice(0, 400)}`);
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

  const [createdIssues, openCount, pecIssues, resolvedIssues] =
    await Promise.all([
      searchAll(
        connection,
        jql.created,
        "created,resolutiondate,assignee,labels,components,issuetype",
      ),
      countJql(connection, jql.open),
      searchAll(
        connection,
        jql.priseEnCharge,
        `created,${pecField}`,
      ).catch((err: Error) => {
        warnings.push(
          `JQL Date Prise en Charge: ${err.message.slice(0, 160)}`,
        );
        return [] as JiraIssue[];
      }),
      searchAll(
        connection,
        jql.resolved,
        "created,resolutiondate",
      ).catch((err: Error) => {
        warnings.push(`JQL resolutiondate: ${err.message.slice(0, 160)}`);
        return [] as JiraIssue[];
      }),
    ]);

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
    "Non résolues = snapshot actuel (comme n8n), pas un historique de fin de semaine.",
  );

  return {
    patch: {
      demandesItHebdo: createdIssues.length,
      demandesNonResoluesHebdo: openCount,
      ticketsHorsSlaPriseEnCharge: slaPriseEnCharge,
      ticketsHorsSlaCloture: slaCloture,
      jiraSyncedAt: new Date().toISOString(),
    },
    byType,
    byAssignee,
    jql,
    warnings,
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
  };
}

export function weekKey(year: number, week: number): string {
  return weekId({ year, month: 1, week });
}

export async function getJiraConfig(): Promise<JiraConnection | null> {
  return resolveJiraConnection();
}
