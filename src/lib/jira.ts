import type { JiraTicketStats } from "./types";

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  /** Projet ou JQL de base, ex. project = IT */
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
    priority?: { name: string } | null;
    status: { name: string; statusCategory?: { key: string } };
    customfield_sla_met?: boolean;
  };
}

async function searchAll(
  config: JiraConfig,
  jql: string,
): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = [];
  let startAt = 0;
  const maxResults = 100;

  // Jira Cloud search API (paginated)
  for (;;) {
    const url = new URL(`${config.baseUrl}/rest/api/3/search`);
    url.searchParams.set("jql", jql);
    url.searchParams.set("startAt", String(startAt));
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set(
      "fields",
      "created,resolutiondate,priority,status",
    );

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: authHeader(config),
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Jira API ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      issues: JiraIssue[];
      total: number;
    };
    issues.push(...data.issues);
    startAt += data.issues.length;
    if (startAt >= data.total || data.issues.length === 0) break;
  }

  return issues;
}

function periodBounds(periodId: string): { start: string; end: string } {
  const [y, m] = periodId.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60);
}

function priorityBucket(
  name: string | undefined,
): keyof JiraTicketStats["byPriority"] {
  const n = (name ?? "").toLowerCase();
  if (n.includes("highest") || n.includes("blocker") || n.includes("critique"))
    return "highest";
  if (n.includes("high") || n.includes("majeur")) return "high";
  if (n.includes("low") && !n.includes("lowest")) return "low";
  if (n.includes("lowest") || n.includes("trivial")) return "lowest";
  return "medium";
}

const DONE_CATEGORIES = new Set(["done"]);

/**
 * Récupère et agrège les stats tickets pour une période YYYY-MM.
 * SLA : approximation via délai < 8h (configurable via JIRA_SLA_HOURS).
 */
export async function fetchJiraStatsForPeriod(
  periodId: string,
): Promise<JiraTicketStats> {
  const config = getJiraConfig();
  if (!config) {
    throw new Error(
      "Jira non configuré. Définir JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN.",
    );
  }

  const { start, end } = periodBounds(periodId);
  const slaHours = Number(process.env.JIRA_SLA_HOURS ?? "8");

  const createdJql = `${config.jqlBase} AND created >= "${start}" AND created <= "${end} 23:59"`;
  const resolvedJql = `${config.jqlBase} AND resolved >= "${start}" AND resolved <= "${end} 23:59"`;
  const openJql = `${config.jqlBase} AND statusCategory != Done`;

  const [createdIssues, resolvedIssues, openIssues] = await Promise.all([
    searchAll(config, createdJql),
    searchAll(config, resolvedJql),
    searchAll(config, openJql),
  ]);

  const byPriority: JiraTicketStats["byPriority"] = {
    highest: 0,
    high: 0,
    medium: 0,
    low: 0,
    lowest: 0,
  };

  let totalResolutionHours = 0;
  let resolvedWithSlaMet = 0;
  let resolvedWithSlaTracked = 0;

  for (const issue of resolvedIssues) {
    const { created, resolutiondate, priority } = issue.fields;
    byPriority[priorityBucket(priority?.name ?? undefined)] += 1;

    if (created && resolutiondate) {
      const hours = hoursBetween(created, resolutiondate);
      totalResolutionHours += hours;
      resolvedWithSlaTracked += 1;
      if (hours <= slaHours) resolvedWithSlaMet += 1;
    }
  }

  // Also count created by priority for visibility
  for (const issue of createdIssues) {
    // already counted resolved priorities separately; created breakdown optional
    void issue;
  }

  return {
    created: createdIssues.length,
    resolved: resolvedIssues.length,
    open: openIssues.filter(
      (i) => !DONE_CATEGORIES.has(i.fields.status.statusCategory?.key ?? ""),
    ).length,
    totalResolutionHours: Math.round(totalResolutionHours * 10) / 10,
    resolvedWithSlaMet,
    resolvedWithSlaTracked,
    byPriority,
    lastSyncedAt: new Date().toISOString(),
  };
}

/** Mode démo : génère des stats réalistes sans appeler Jira */
export function mockJiraStats(periodId: string): JiraTicketStats {
  const seed = periodId.split("-").reduce((a, b) => a + Number(b), 0);
  const created = 30 + (seed % 20);
  const resolved = created + (seed % 5) - 2;
  const open = 10 + (seed % 12);
  return {
    created,
    resolved: Math.max(0, resolved),
    open,
    totalResolutionHours: resolved * (3 + (seed % 4)),
    resolvedWithSlaMet: Math.round(resolved * 0.92),
    resolvedWithSlaTracked: resolved,
    byPriority: {
      highest: 1 + (seed % 2),
      high: 4 + (seed % 4),
      medium: Math.round(created * 0.5),
      low: 5,
      lowest: 2,
    },
    lastSyncedAt: new Date().toISOString(),
  };
}
