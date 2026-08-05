/**
 * Tickets individuels Jira — snapshot « ouverts » live + recherche pour drill-down.
 * Distinct des ventilations hebdo (tickets créés → counts only).
 */

import type { JiraConnection } from "./jira-auth";
import { resolveJiraConnection } from "./jira-auth";
import {
  buildWeekJql,
  categoryOf,
  isoWeekDateRange,
  personName,
  resolveCategorySource,
  searchAll,
} from "./jira";
import { parseWeekId } from "./types";

export interface TicketListItem {
  key: string;
  summary: string;
  created: string;
  ageDays: number;
  status: string;
  assignee: string;
  requester: string;
  type: string;
  browseUrl: string;
}

export interface AssigneeOpenGroup {
  name: string;
  count: number;
  byType: Record<string, number>;
  oldestAgeDays: number;
  avgAgeDays: number;
  tickets: TicketListItem[];
}

export interface OpenTicketsSnapshot {
  fetchedAt: string;
  jql: string;
  total: number;
  unassigned: number;
  tickets: TicketListItem[];
  byAssignee: AssigneeOpenGroup[];
  warnings: string[];
}

export type TicketSearchScope = "open" | "created";

export interface TicketSearchFilter {
  scope: TicketSearchScope;
  /** Nom affiché ; « Non assigné » → assignee is EMPTY (filtre aussi côté client). */
  assignee?: string;
  requester?: string;
  /** Catégorie IT — filtrée côté client après fetch. */
  type?: string;
  weekId?: string;
  year?: number;
}

export interface TicketSearchResult {
  jql: string;
  tickets: TicketListItem[];
  total: number;
  truncated: boolean;
  warnings: string[];
  filters: TicketSearchFilter;
}

export function jiraBrowseUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/$/, "")}/browse/${key}`;
}

export function ticketAgeDays(createdIso: string, now = new Date()): number {
  const t = Date.parse(createdIso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

export function buildOpenJql(conn: JiraConnection): string {
  return `${conn.jqlBase.trim()} AND ${conn.openStatusJql} ORDER BY created ASC`;
}

function escapeJqlString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function mapIssue(
  issue: {
    key: string;
    fields: {
      created: string;
      summary?: string;
      status?: { name?: string };
      assignee?: Parameters<typeof personName>[0];
      reporter?: Parameters<typeof personName>[0];
      creator?: Parameters<typeof personName>[0];
      [k: string]: unknown;
    };
  },
  conn: JiraConnection,
  categorySource: Pick<
    JiraConnection,
    "categoryField" | "categoryCustomFieldId"
  >,
  now: Date,
): TicketListItem {
  return {
    key: issue.key,
    summary: (issue.fields.summary ?? "").trim() || "(sans titre)",
    created: issue.fields.created,
    ageDays: ticketAgeDays(issue.fields.created, now),
    status: issue.fields.status?.name?.trim() || "—",
    assignee: personName(issue.fields.assignee, "Non assigné"),
    requester: personName(
      issue.fields.reporter ?? issue.fields.creator,
      "Inconnu",
    ),
    type: categoryOf(issue as never, categorySource),
    browseUrl: jiraBrowseUrl(conn.baseUrl, issue.key),
  };
}

export function aggregateByAssignee(
  tickets: TicketListItem[],
): AssigneeOpenGroup[] {
  const map = new Map<string, TicketListItem[]>();
  for (const t of tickets) {
    const list = map.get(t.assignee) ?? [];
    list.push(t);
    map.set(t.assignee, list);
  }

  const groups: AssigneeOpenGroup[] = [];
  for (const [name, list] of map) {
    const byType: Record<string, number> = {};
    let ageSum = 0;
    let oldest = 0;
    for (const t of list) {
      byType[t.type] = (byType[t.type] ?? 0) + 1;
      ageSum += t.ageDays;
      if (t.ageDays > oldest) oldest = t.ageDays;
    }
    groups.push({
      name,
      count: list.length,
      byType,
      oldestAgeDays: oldest,
      avgAgeDays: list.length ? Math.round(ageSum / list.length) : 0,
      tickets: [...list].sort((a, b) => b.ageDays - a.ageDays),
    });
  }

  return groups.sort((a, b) => {
    if (a.name === "Non assigné") return -1;
    if (b.name === "Non assigné") return 1;
    return b.count - a.count || a.name.localeCompare(b.name, "fr");
  });
}

export function filterTicketList(
  tickets: TicketListItem[],
  filter: Pick<TicketSearchFilter, "assignee" | "requester" | "type">,
): TicketListItem[] {
  return tickets.filter((t) => {
    if (filter.assignee && t.assignee !== filter.assignee) return false;
    if (filter.requester && t.requester !== filter.requester) return false;
    if (filter.type && t.type !== filter.type) return false;
    return true;
  });
}

/** Construit le JQL de base (sans filtre catégorie — appliqué ensuite). */
export function buildTicketSearchJql(
  conn: JiraConnection,
  filter: TicketSearchFilter,
): string {
  const parts: string[] = [conn.jqlBase.trim()];

  if (filter.scope === "open") {
    parts.push(`(${conn.openStatusJql})`);
  } else if (filter.weekId) {
    const { year, week } = parseWeekId(filter.weekId);
    const range = isoWeekDateRange(year, week);
    parts.push(
      `created >= "${range.start} 00:00" AND created < "${range.endExclusive} 00:00"`,
    );
  } else if (filter.year) {
    const y = filter.year;
    parts.push(`created >= "${y}-01-01 00:00" AND created < "${y + 1}-01-01 00:00"`);
  }

  if (filter.assignee === "Non assigné") {
    parts.push("assignee is EMPTY");
  } else if (filter.assignee) {
    parts.push(`assignee = "${escapeJqlString(filter.assignee)}"`);
  }

  if (filter.requester === "Inconnu") {
    parts.push("reporter is EMPTY");
  } else if (filter.requester) {
    parts.push(`reporter = "${escapeJqlString(filter.requester)}"`);
  }

  return `${parts.join(" AND ")} ORDER BY created ASC`;
}

async function issuesToTickets(
  conn: JiraConnection,
  issues: Awaited<ReturnType<typeof searchAll>>,
  warnings: string[],
  now = new Date(),
): Promise<TicketListItem[]> {
  const categorySource = await resolveCategorySource(conn, issues, warnings);
  return issues.map((issue) => mapIssue(issue, conn, categorySource, now));
}

export async function fetchOpenTicketsSnapshot(
  conn?: JiraConnection | null,
): Promise<OpenTicketsSnapshot> {
  const connection = conn ?? (await resolveJiraConnection());
  if (!connection) {
    throw new Error(
      "Aucun compte Jira connecté. Connectez-vous depuis la page Sync Jira.",
    );
  }

  const warnings: string[] = [];
  const jql = buildOpenJql(connection);
  const now = new Date();

  let issues = await searchAll(connection, jql, "*all").catch((err: Error) => {
    warnings.push(`Search ouverts (*all): ${err.message.slice(0, 160)}`);
    return [];
  });
  if (issues.length === 0) {
    issues = await searchAll(
      connection,
      jql,
      "summary,created,status,assignee,reporter,creator,labels,components,issuetype" +
        (connection.categoryCustomFieldId
          ? `,${connection.categoryCustomFieldId}`
          : ""),
    ).catch((err: Error) => {
      warnings.push(`Search ouverts (fields): ${err.message.slice(0, 160)}`);
      return [];
    });
  }

  const tickets = await issuesToTickets(connection, issues, warnings, now);
  const byAssignee = aggregateByAssignee(tickets);
  const unassigned =
    byAssignee.find((g) => g.name === "Non assigné")?.count ?? 0;

  return {
    fetchedAt: now.toISOString(),
    jql,
    total: tickets.length,
    unassigned,
    tickets,
    byAssignee,
    warnings,
  };
}

export async function searchTickets(
  filter: TicketSearchFilter,
  conn?: JiraConnection | null,
): Promise<TicketSearchResult> {
  const connection = conn ?? (await resolveJiraConnection());
  if (!connection) {
    throw new Error(
      "Aucun compte Jira connecté. Connectez-vous depuis la page Sync Jira.",
    );
  }

  const warnings: string[] = [];
  // Pour le type (catégorie custom), on élargit le JQL puis on filtre client.
  const jqlFilter: TicketSearchFilter = {
    ...filter,
    type: undefined,
  };
  // Si assignee échoue en JQL (displayName), on retentera sans assignee.
  let jql = buildTicketSearchJql(connection, jqlFilter);

  let issues = await searchAll(connection, jql, "*all").catch((err: Error) => {
    warnings.push(`Search: ${err.message.slice(0, 160)}`);
    return [];
  });

  if (
    issues.length === 0 &&
    filter.assignee &&
    filter.assignee !== "Non assigné"
  ) {
    const withoutAssignee = buildTicketSearchJql(connection, {
      ...jqlFilter,
      assignee: undefined,
    });
    warnings.push(
      `JQL assignee = « ${filter.assignee} » sans résultat — retentative sans filtre assignee, filtrage local.`,
    );
    jql = withoutAssignee;
    issues = await searchAll(connection, jql, "*all").catch((err: Error) => {
      warnings.push(`Search (retry): ${err.message.slice(0, 160)}`);
      return [];
    });
  }

  if (issues.length === 0) {
    issues = await searchAll(
      connection,
      jql,
      "summary,created,status,assignee,reporter,creator,labels,components,issuetype" +
        (connection.categoryCustomFieldId
          ? `,${connection.categoryCustomFieldId}`
          : ""),
    ).catch(() => []);
  }

  const mapped = await issuesToTickets(connection, issues, warnings);
  const tickets = filterTicketList(mapped, filter);
  const truncated = issues.length >= 5000;

  return {
    jql,
    tickets,
    total: tickets.length,
    truncated,
    warnings,
    filters: filter,
  };
}

/** Aide tests / UI : libellé lisible des filtres actifs. */
export function describeTicketFilters(filter: TicketSearchFilter): string {
  const bits: string[] = [
    filter.scope === "open" ? "ouverts (live)" : "créés",
  ];
  if (filter.weekId) bits.push(`semaine ${filter.weekId}`);
  else if (filter.year) bits.push(`année ${filter.year}`);
  if (filter.assignee) bits.push(`assigné : ${filter.assignee}`);
  if (filter.requester) bits.push(`demandeur : ${filter.requester}`);
  if (filter.type) bits.push(`type : ${filter.type}`);
  return bits.join(" · ");
}

/** Utilitaire pour tests unitaires sans Jira. */
export function buildWeekCreatedJqlForTest(
  conn: Pick<JiraConnection, "jqlBase">,
  year: number,
  week: number,
): string {
  return buildWeekJql(conn as JiraConnection, year, week).created;
}
