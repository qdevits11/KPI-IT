/**
 * Tickets individuels Jira — snapshot « ouverts » live + recherche pour drill-down.
 * Distinct des ventilations hebdo (tickets créés → counts only).
 */

import type { JiraConnection } from "./jira-auth";
import { resolveJiraConnection } from "./jira-auth";
import {
  bestCategoryFromIssue,
  buildOpenAsOfJql,
  buildWeekJql,
  customFieldValue,
  isoWeekDateRange,
  personName,
  pickAvatarUrl,
  resolveCategorySource,
  searchAll,
  type JiraIssue,
  type JiraUser,
} from "./jira";
import { filterOverBusinessSla } from "./business-hours";
import { parseWeekId } from "./types";
import {
  mergePeopleDirectory,
  personEntryFromJiraUser,
  type PersonDirectoryEntry,
} from "./avatars";

export interface TicketListItem {
  key: string;
  summary: string;
  created: string;
  ageDays: number;
  status: string;
  assignee: string;
  assigneeAvatarUrl?: string;
  requester: string;
  requesterAvatarUrl?: string;
  type: string;
  browseUrl: string;
}

export interface AssigneeOpenGroup {
  name: string;
  avatarUrl?: string;
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

export type TicketSearchScope =
  | "open"
  | "created"
  | "sla_pec"
  | "sla_cloture";

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

/** Champs Jira à demander pour les listes tickets (tous les customfields). */
export function ticketSearchFields(
  _conn: Pick<
    JiraConnection,
    "categoryField" | "categoryCustomFieldId" | "datePriseEnChargeFieldId"
  >,
  _scope: TicketSearchScope,
): string {
  return "*all";
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
      assignee?: JiraUser | null;
      reporter?: JiraUser | null;
      creator?: JiraUser | null;
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
  const assignee = issue.fields.assignee;
  const requester = issue.fields.reporter ?? issue.fields.creator;
  return {
    key: issue.key,
    summary: (issue.fields.summary ?? "").trim() || "(sans titre)",
    created: issue.fields.created,
    ageDays: ticketAgeDays(issue.fields.created, now),
    status: issue.fields.status?.name?.trim() || "—",
    assignee: personName(assignee, "Non assigné"),
    assigneeAvatarUrl: pickAvatarUrl(assignee?.avatarUrls),
    requester: personName(requester, "Inconnu"),
    requesterAvatarUrl: pickAvatarUrl(requester?.avatarUrls),
    type: bestCategoryFromIssue(issue as JiraIssue, categorySource),
    browseUrl: jiraBrowseUrl(conn.baseUrl, issue.key),
  };
}

export function peopleFromTickets(
  tickets: TicketListItem[],
  rawIssues?: Array<{
    fields: {
      assignee?: JiraUser | null;
      reporter?: JiraUser | null;
      creator?: JiraUser | null;
    };
  }>,
): PersonDirectoryEntry[] {
  const bag: PersonDirectoryEntry[] = [];
  if (rawIssues) {
    for (const issue of rawIssues) {
      const a = personEntryFromJiraUser(issue.fields.assignee);
      if (a) bag.push(a);
      const r = personEntryFromJiraUser(
        issue.fields.reporter ?? issue.fields.creator,
      );
      if (r) bag.push(r);
    }
  }
  for (const t of tickets) {
    if (t.assigneeAvatarUrl) {
      bag.push({
        displayName: t.assignee,
        avatarUrl: t.assigneeAvatarUrl,
        updatedAt: new Date().toISOString(),
      });
    }
    if (t.requesterAvatarUrl) {
      bag.push({
        displayName: t.requester,
        avatarUrl: t.requesterAvatarUrl,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return Object.values(mergePeopleDirectory({}, bag));
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
    let avatarUrl: string | undefined;
    for (const t of list) {
      byType[t.type] = (byType[t.type] ?? 0) + 1;
      ageSum += t.ageDays;
      if (t.ageDays > oldest) oldest = t.ageDays;
      if (!avatarUrl && t.assigneeAvatarUrl) avatarUrl = t.assigneeAvatarUrl;
    }
    groups.push({
      name,
      avatarUrl,
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

function weekJqlForScope(
  conn: JiraConnection,
  scope: TicketSearchScope,
  weekId: string,
): string {
  const { year, week } = parseWeekId(weekId);
  const bundle = buildWeekJql(conn, year, week);
  if (scope === "sla_pec") return bundle.priseEnCharge;
  if (scope === "sla_cloture") return bundle.resolved;
  return bundle.created;
}

/** Construit le JQL de base (sans filtre catégorie — appliqué ensuite). */
export function buildTicketSearchJql(
  conn: JiraConnection,
  filter: TicketSearchFilter,
): string {
  if (
    (filter.scope === "sla_pec" || filter.scope === "sla_cloture") &&
    filter.weekId
  ) {
    return weekJqlForScope(conn, filter.scope, filter.weekId);
  }

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

function slaEventDate(
  issue: JiraIssue,
  scope: "sla_pec" | "sla_cloture",
  pecFieldId: string,
): string | null {
  if (scope === "sla_pec") return customFieldValue(issue, pecFieldId);
  return issue.fields.resolutiondate ?? null;
}

function filterIssuesOverSla(
  issues: JiraIssue[],
  scope: "sla_pec" | "sla_cloture",
  conn: JiraConnection,
): JiraIssue[] {
  const thresholdHours =
    scope === "sla_pec"
      ? conn.slaPriseEnChargeHours
      : conn.slaClotureHours;
  const pecFieldId = conn.datePriseEnChargeFieldId;
  return filterOverBusinessSla(
    issues.map((issue) => ({
      issue,
      created: issue.fields.created,
      eventDate: slaEventDate(issue, scope, pecFieldId),
    })),
    thresholdHours,
  ).map((row) => row.issue);
}

/** Agrège un bag assigné → count à partir d’un snapshot. */
export function countsByAssignee(
  byAssignee: AssigneeOpenGroup[],
): Record<string, number> {
  const bag: Record<string, number> = {};
  for (const g of byAssignee) {
    if (g.count > 0) bag[g.name] = g.count;
  }
  return bag;
}

/** Reconstitue un snapshot UI à partir d’un figement counts-only. */
export function openSnapshotFromAssigneeCounts(
  byAssignee: Record<string, number>,
  opts: {
    fetchedAt: string;
    jql?: string;
    warnings?: string[];
  },
): OpenTicketsSnapshot {
  const groups: AssigneeOpenGroup[] = Object.entries(byAssignee)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => ({
      name,
      count,
      byType: {},
      oldestAgeDays: 0,
      avgAgeDays: 0,
      tickets: [],
    }))
    .sort((a, b) => {
      if (a.name === "Non assigné") return -1;
      if (b.name === "Non assigné") return 1;
      return b.count - a.count || a.name.localeCompare(b.name, "fr");
    });
  const total = groups.reduce((sum, g) => sum + g.count, 0);
  return {
    fetchedAt: opts.fetchedAt,
    jql: opts.jql ?? "",
    total,
    unassigned: byAssignee["Non assigné"] ?? 0,
    tickets: [],
    byAssignee: groups,
    warnings: opts.warnings ?? [],
  };
}

/**
 * Stock ouvert historique à une date (typ. dimanche fin de semaine ISO).
 * Assignee = champ actuel des tickets qui étaient ouverts à cette date
 * (best-effort si réassignation ultérieure).
 */
export async function fetchOpenTicketsAsOf(
  asOfDate: string,
  conn?: JiraConnection | null,
): Promise<OpenTicketsSnapshot> {
  const connection = conn ?? (await resolveJiraConnection());
  if (!connection) {
    throw new Error(
      "Aucun compte Jira connecté. Connectez-vous depuis la page Sync Jira.",
    );
  }

  const warnings: string[] = [
    `Reconstitution historique au ${asOfDate} — assigné = responsable actuel des tickets alors ouverts.`,
  ];
  const jql = buildOpenAsOfJql(connection, asOfDate);
  // Âge calculé comme à la fin de la journée as-of (midi UTC suffisant)
  const asOf = new Date(`${asOfDate}T23:59:59.000Z`);
  const searchFields = "summary,created,status,assignee,reporter,creator";

  let issues = await searchAll(connection, jql, searchFields).catch(
    (err: Error) => {
      warnings.push(`Search historique: ${err.message.slice(0, 160)}`);
      return [];
    },
  );
  if (issues.length === 0) {
    issues = await searchAll(connection, jql, "*all").catch((err: Error) => {
      warnings.push(`Search historique (*all): ${err.message.slice(0, 160)}`);
      return [];
    });
  }

  const tickets = await issuesToTickets(connection, issues, warnings, asOf);
  const byAssignee = aggregateByAssignee(tickets);
  const unassigned =
    byAssignee.find((g) => g.name === "Non assigné")?.count ?? 0;

  return {
    fetchedAt: new Date().toISOString(),
    jql,
    total: tickets.length,
    unassigned,
    tickets,
    byAssignee,
    warnings,
  };
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
  const searchFields = ticketSearchFields(connection, "open");

  let issues = await searchAll(connection, jql, searchFields).catch((err: Error) => {
    warnings.push(`Search ouverts (${searchFields}): ${err.message.slice(0, 160)}`);
    return [];
  });
  if (issues.length === 0 && searchFields !== "*all") {
    issues = await searchAll(connection, jql, "*all").catch((err: Error) => {
      warnings.push(`Search ouverts (*all): ${err.message.slice(0, 160)}`);
      return [];
    });
  }

  const tickets = await issuesToTickets(connection, issues, warnings, now);
  const byAssignee = aggregateByAssignee(tickets);
  const unassigned =
    byAssignee.find((g) => g.name === "Non assigné")?.count ?? 0;

  try {
    const { mergePeopleFromJira } = await import("./store");
    await mergePeopleFromJira(peopleFromTickets(tickets, issues));
  } catch {
    // persistance optionnelle
  }

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
  if (
    (filter.scope === "sla_pec" || filter.scope === "sla_cloture") &&
    !filter.weekId
  ) {
    throw new Error(
      "Pour les listes hors SLA, indiquez la semaine (week, ex. 2026-S32).",
    );
  }

  // Pour le type (catégorie custom), on élargit le JQL puis on filtre client.
  const jqlFilter: TicketSearchFilter = {
    ...filter,
    type: undefined,
  };
  // Si assignee échoue en JQL (displayName), on retentera sans assignee.
  let jql = buildTicketSearchJql(connection, jqlFilter);
  const searchFields = ticketSearchFields(connection, filter.scope);

  let issues = await searchAll(connection, jql, searchFields).catch((err: Error) => {
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
    issues = await searchAll(connection, jql, searchFields).catch((err: Error) => {
      warnings.push(`Search (retry): ${err.message.slice(0, 160)}`);
      return [];
    });
  }

  if (issues.length === 0 && searchFields !== "*all") {
    issues = await searchAll(connection, jql, "*all").catch(() => []);
  }

  if (filter.scope === "sla_pec" || filter.scope === "sla_cloture") {
    const before = issues.length;
    issues = filterIssuesOverSla(issues, filter.scope, connection);
    if (before > 0 && issues.length === 0) {
      warnings.push(
        `${before} candidat(s) Jira cette semaine, aucun hors SLA après filtrage horaires ouvrés.`,
      );
    }
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
  const scopeLabel =
    filter.scope === "open"
      ? "ouverts (live)"
      : filter.scope === "sla_pec"
        ? "hors SLA prise en charge"
        : filter.scope === "sla_cloture"
          ? "hors SLA clôture"
          : "créés";
  const bits: string[] = [scopeLabel];
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
