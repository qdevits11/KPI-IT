import type { WeeklyRow } from "./types";
import { weekId } from "./types";

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  jqlBase: string;
}

export function getJiraConfig(): JiraConfig | null {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  const jqlBase = process.env.JIRA_JQL_BASE ?? "project is not EMPTY";
  if (!baseUrl || !email || !apiToken) return null;
  return { baseUrl, email, apiToken, jqlBase };
}

function authHeader(config: JiraConfig): string {
  return `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`;
}

interface JiraIssue {
  fields: {
    created: string;
    resolutiondate: string | null;
    assignee?: { displayName: string } | null;
    labels?: string[];
    // custom fields vary — category often in a custom field or component
    components?: { name: string }[];
    customfield_category?: { value: string } | string | null;
  };
}

async function searchAll(config: JiraConfig, jql: string): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = [];
  let startAt = 0;
  const maxResults = 100;
  for (;;) {
    const url = new URL(`${config.baseUrl}/rest/api/3/search`);
    url.searchParams.set("jql", jql);
    url.searchParams.set("startAt", String(startAt));
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("fields", "created,resolutiondate,assignee,labels,components");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: authHeader(config),
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Jira API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as { issues: JiraIssue[]; total: number };
    issues.push(...data.issues);
    startAt += data.issues.length;
    if (startAt >= data.total || data.issues.length === 0) break;
  }
  return issues;
}

/** Bornes lundi–dimanche d'une semaine ISO */
export function isoWeekDateRange(
  year: number,
  week: number,
): { start: string; end: string } {
  // ISO week: Thursday determines the year
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

export interface JiraWeekSyncResult {
  patch: Partial<WeeklyRow>;
  byType: Record<string, number>;
  byAssignee: Record<string, number>;
}

/**
 * Sync hebdo : demandes IT (= créés), non résolues (= open snapshot),
 * ventilation type (composant) et responsable (assignee).
 * Les hors-SLA restent manuels tant que les champs SLA Jira ne sont pas mappés.
 */
export async function fetchJiraWeekStats(
  year: number,
  week: number,
): Promise<JiraWeekSyncResult> {
  const config = getJiraConfig();
  if (!config) {
    throw new Error(
      "Jira non configuré. Définir JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN.",
    );
  }
  const { start, end } = isoWeekDateRange(year, week);
  const createdJql = `${config.jqlBase} AND created >= "${start}" AND created <= "${end} 23:59"`;
  const openJql = `${config.jqlBase} AND statusCategory != Done`;

  const [created, open] = await Promise.all([
    searchAll(config, createdJql),
    searchAll(config, openJql),
  ]);

  const byType: Record<string, number> = {};
  const byAssignee: Record<string, number> = {};

  for (const issue of created) {
    const cat =
      issue.fields.components?.[0]?.name ??
      issue.fields.labels?.[0] ??
      "Non catégorisé";
    byType[cat] = (byType[cat] ?? 0) + 1;
    const who = issue.fields.assignee?.displayName ?? "Non assigné";
    byAssignee[who] = (byAssignee[who] ?? 0) + 1;
  }

  return {
    patch: {
      demandesItHebdo: created.length,
      demandesNonResoluesHebdo: open.length,
      jiraSyncedAt: new Date().toISOString(),
    },
    byType,
    byAssignee,
  };
}

export function mockJiraWeekStats(
  year: number,
  week: number,
): JiraWeekSyncResult {
  const seed = year + week * 17;
  const created = 20 + (seed % 35);
  const open = 30 + (seed % 50);
  return {
    patch: {
      demandesItHebdo: created,
      demandesNonResoluesHebdo: open,
      jiraSyncedAt: new Date().toISOString(),
    },
    byType: {
      Odoo: Math.round(created * 0.35),
      Elfsquad: Math.round(created * 0.2),
      Teams: Math.round(created * 0.1),
      "Non catégorisé": Math.round(created * 0.15),
      Extract: Math.round(created * 0.1),
      Outlook: created - Math.round(created * 0.9),
    },
    byAssignee: {
      "Gary Schreurs": Math.round(created * 0.4),
      "Loic Voumard": Math.round(created * 0.3),
      "Devits Quentin": Math.round(created * 0.25),
      "Dominique Kudas": Math.max(0, created - Math.round(created * 0.95)),
    },
  };
}

export function weekKey(year: number, week: number): string {
  return weekId({ year, month: 1, week });
}
