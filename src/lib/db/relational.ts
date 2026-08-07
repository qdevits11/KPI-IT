/**
 * Persistance relationnelle KPI·IT (tables Postgres).
 * Source de vérité quand Supabase est configuré.
 */

import { randomUUID } from "crypto";
import type {
  AppAccessUser,
  AppDatabase,
  LogEvent,
  PhishingEvent,
  WeeklyRow,
} from "../types";
import { APP_SCHEMA_VERSION, emptyAppSettings, weekId } from "../types";
import { createEmptyDatabase, createEmptyWeek } from "../seed";
import { isoWeekPartsFromDate } from "../dates";
import {
  canonicalResponsible,
  DEFAULT_RESPONSIBLES,
  normalizeResponsibleName,
  sortResponsibles,
} from "../responsibles";
import {
  encodingLabel,
  findAccessUser,
  normalizeAccessUsers,
  normalizeEmail,
  rightsFromAccessEntry,
} from "../roles";
import {
  mergePeopleDirectory,
  type PeopleDirectory,
  type PersonDirectoryEntry,
} from "../avatars";
import { getServiceClient } from "./client";
import {
  COLLECTION_TO_LOG_KIND,
  KPI_META_ID,
  KPI_SETTINGS_ID,
  TABLES,
  type BreakdownDimension,
  type LogEventKind,
} from "./tables";

type LogCollection = keyof typeof COLLECTION_TO_LOG_KIND;

/**
 * PostgREST / Supabase coupe les SELECT à 1000 lignes par défaut.
 * Sans pagination, les ventilations des semaines récentes disparaissent
 * silencieusement dans Analyse (ex. S30+ une fois >1000 rows).
 */
export const SUPABASE_PAGE_SIZE = 1000;

type RangeQuery = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

/** Charge toutes les lignes d’une requête range-able (boucle .range). */
export async function fetchAllRows<T>(
  build: () => RangeQuery,
  pageSize = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + pageSize - 1;
    const { data, error } = await build().range(from, to);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as T[];
    out.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

type MetaRow = {
  id: string;
  schema_version: number;
  revision: number;
  year: number;
  updated_at: string;
};

type WeekRow = {
  week_id: string;
  year: number;
  month: number;
  week: number;
  tickets_hors_sla_cloture: number | null;
  tickets_hors_sla_prise_en_charge: number | null;
  demandes_it_hebdo: number | null;
  demandes_non_resolues_hebdo: number | null;
  open_frozen_at: string | null;
  informations: string;
  reaction: string;
  jira_synced_at: string | null;
  updated_at: string | null;
};

type LogRow = {
  id: string;
  kind: LogEventKind;
  event_date: string;
  year: number;
  month: number;
  week: number;
  explanation: string;
  responsible: string;
};

type PhishRow = {
  id: string;
  event_date: string;
  year: number;
  month: number;
  week: number;
  failures: number;
  explanation: string;
  responsible: string;
};

type BreakdownRow = {
  week_id: string;
  dimension: BreakdownDimension;
  label: string;
  count: number;
};

type AccessRow = {
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  is_kpi_responsible: boolean;
  is_encoding_responsible: boolean;
  last_login_at: string | null;
  updated_at: string | null;
};

type PeopleRow = {
  display_name: string;
  account_id: string | null;
  avatar_url: string | null;
  updated_at: string | null;
};

type SettingsRow = {
  id: string;
  responsibles: string[] | null;
  updated_at: string;
};

function requireClient() {
  const sb = getServiceClient();
  if (!sb) throw new Error("Supabase non configuré");
  return sb;
}

function isoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  return value;
}

function weekRowToWeekly(row: WeekRow): WeeklyRow {
  return {
    year: row.year,
    month: row.month,
    week: row.week,
    ticketsHorsSlaCloture: row.tickets_hors_sla_cloture,
    ticketsHorsSlaPriseEnCharge: row.tickets_hors_sla_prise_en_charge,
    demandesItHebdo: row.demandes_it_hebdo,
    demandesNonResoluesHebdo: row.demandes_non_resolues_hebdo,
    openFrozenAt: isoOrNull(row.open_frozen_at),
    informations: row.informations ?? "",
    reaction: row.reaction ?? "",
    jiraSyncedAt: isoOrNull(row.jira_synced_at),
    updatedAt: isoOrNull(row.updated_at),
  };
}

function weeklyToWeekRow(row: WeeklyRow): WeekRow {
  return {
    week_id: weekId(row),
    year: row.year,
    month: row.month,
    week: row.week,
    tickets_hors_sla_cloture: row.ticketsHorsSlaCloture,
    tickets_hors_sla_prise_en_charge: row.ticketsHorsSlaPriseEnCharge,
    demandes_it_hebdo: row.demandesItHebdo,
    demandes_non_resolues_hebdo: row.demandesNonResoluesHebdo,
    open_frozen_at: row.openFrozenAt,
    informations: row.informations ?? "",
    reaction: row.reaction ?? "",
    jira_synced_at: row.jiraSyncedAt,
    updated_at: row.updatedAt,
  };
}

function logRowToEvent(row: LogRow): LogEvent {
  return {
    id: row.id,
    date: row.event_date.slice(0, 10),
    year: row.year,
    month: row.month,
    week: row.week,
    explanation: row.explanation ?? "",
    responsible: row.responsible ?? "",
  };
}

function phishRowToEvent(row: PhishRow): PhishingEvent {
  return {
    id: row.id,
    date: row.event_date.slice(0, 10),
    year: row.year,
    month: row.month,
    week: row.week,
    failures: row.failures ?? 0,
    explanation: row.explanation ?? "",
    responsible: row.responsible ?? "",
  };
}

function accessRowToUser(row: AccessRow): AppAccessUser {
  return {
    email: normalizeEmail(row.email),
    displayName: row.display_name ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    isAdmin: Boolean(row.is_admin),
    isKpiResponsible: Boolean(row.is_kpi_responsible),
    isEncodingResponsible: Boolean(row.is_encoding_responsible),
    lastLoginAt: row.last_login_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

function userToAccessRow(user: AppAccessUser): AccessRow {
  return {
    email: normalizeEmail(user.email),
    display_name: user.displayName?.trim() || null,
    avatar_url: user.avatarUrl?.trim() || null,
    is_admin: Boolean(user.isAdmin),
    is_kpi_responsible: Boolean(user.isKpiResponsible),
    is_encoding_responsible: Boolean(user.isEncodingResponsible),
    last_login_at: user.lastLoginAt ?? null,
    updated_at: user.updatedAt ?? null,
  };
}

function bagFromBreakdowns(
  rows: BreakdownRow[],
  dimension: BreakdownDimension,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    if (row.dimension !== dimension) continue;
    if (!out[row.week_id]) out[row.week_id] = {};
    out[row.week_id][row.label] = row.count;
  }
  return out;
}

function peopleFromRows(rows: PeopleRow[]): PeopleDirectory {
  const out: PeopleDirectory = {};
  for (const row of rows) {
    out[row.display_name] = {
      displayName: row.display_name,
      accountId: row.account_id ?? undefined,
      avatarUrl: row.avatar_url ?? undefined,
      updatedAt: row.updated_at ?? new Date(0).toISOString(),
    };
  }
  return out;
}

/** Vérifie que le schéma relationnel est peuplé. */
export async function relationalReady(): Promise<boolean> {
  const sb = getServiceClient();
  if (!sb) return false;
  const { data, error } = await sb
    .from(TABLES.meta)
    .select("id")
    .eq("id", KPI_META_ID)
    .maybeSingle();
  if (error) {
    console.warn("Lecture kpi_meta impossible:", error.message);
    return false;
  }
  return Boolean(data);
}

export async function ensureRelationalSeed(): Promise<void> {
  const sb = requireClient();
  if (await relationalReady()) return;
  const empty = createEmptyDatabase();
  const { error } = await sb.from(TABLES.meta).upsert({
    id: KPI_META_ID,
    schema_version: APP_SCHEMA_VERSION,
    revision: 1,
    year: empty.year,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`seed kpi_meta: ${error.message}`);
  await sb.from(TABLES.settings).upsert({
    id: KPI_SETTINGS_ID,
    responsibles: [...DEFAULT_RESPONSIBLES],
    updated_at: new Date().toISOString(),
  });
}

async function bumpRevision(sb = requireClient()): Promise<number> {
  const { data, error } = await sb
    .from(TABLES.meta)
    .select("revision")
    .eq("id", KPI_META_ID)
    .maybeSingle();
  if (error) throw new Error(`kpi_meta: ${error.message}`);
  if (!data) {
    await ensureRelationalSeed();
    return 1;
  }
  const next = (Number(data.revision) || 0) + 1;
  const { error: upd } = await sb
    .from(TABLES.meta)
    .update({
      schema_version: APP_SCHEMA_VERSION,
      revision: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", KPI_META_ID);
  if (upd) throw new Error(`kpi_meta bump: ${upd.message}`);
  return next;
}

export async function loadAppDatabaseFromTables(): Promise<AppDatabase> {
  const sb = requireClient();
  await ensureRelationalSeed();

  const [metaRes, settingsRes, weeks, logs, phishing, breakdowns, access, people] =
    await Promise.all([
      sb.from(TABLES.meta).select("*").eq("id", KPI_META_ID).maybeSingle(),
      sb
        .from(TABLES.settings)
        .select("*")
        .eq("id", KPI_SETTINGS_ID)
        .maybeSingle(),
      fetchAllRows<WeekRow>(() => sb.from(TABLES.weeks).select("*")),
      fetchAllRows<LogRow>(() => sb.from(TABLES.logEvents).select("*")),
      fetchAllRows<PhishRow>(() => sb.from(TABLES.phishing).select("*")),
      fetchAllRows<BreakdownRow>(() => sb.from(TABLES.breakdowns).select("*")),
      fetchAllRows<AccessRow>(() => sb.from(TABLES.accessUsers).select("*")),
      fetchAllRows<PeopleRow>(() => sb.from(TABLES.people).select("*")),
    ]);

  if (metaRes.error) {
    throw new Error(`Lecture relationnelle: ${metaRes.error.message}`);
  }
  if (settingsRes.error) {
    throw new Error(`Lecture relationnelle: ${settingsRes.error.message}`);
  }

  const meta = metaRes.data as MetaRow | null;
  const settings = settingsRes.data as SettingsRow | null;

  const automationsMetier = logs
    .filter((l) => l.kind === "metier")
    .map(logRowToEvent);
  const automationsOdoo = logs
    .filter((l) => l.kind === "odoo")
    .map(logRowToEvent);
  const maintenances = logs
    .filter((l) => l.kind === "maintenance")
    .map(logRowToEvent);

  const accessUsers = normalizeAccessUsers(access.map(accessRowToUser));
  const responsiblesRaw =
    settings?.responsibles && settings.responsibles.length > 0
      ? settings.responsibles
      : [...DEFAULT_RESPONSIBLES];

  // Alignement responsables ↔ flags encodage
  const fromUsers = sortResponsibles(
    accessUsers
      .filter((u) => u.isEncodingResponsible)
      .map((u) => encodingLabel(u)),
  );
  const responsibles =
    fromUsers.length > 0 ? fromUsers : sortResponsibles(responsiblesRaw);

  return {
    schemaVersion: meta?.schema_version ?? APP_SCHEMA_VERSION,
    revision: meta?.revision ?? 1,
    year: meta?.year ?? new Date().getFullYear(),
    weeks: weeks.map(weekRowToWeekly),
    automationsMetier,
    automationsOdoo,
    maintenances,
    phishing: phishing.map(phishRowToEvent),
    ticketsByType: bagFromBreakdowns(breakdowns, "type"),
    ticketsByAssignee: bagFromBreakdowns(breakdowns, "assignee"),
    ticketsByRequester: bagFromBreakdowns(breakdowns, "requester"),
    settings: {
      ...emptyAppSettings(),
      responsibles,
      accessUsers,
      peopleDirectory: peopleFromRows(people),
    },
  };
}

async function syncResponsiblesList(
  users: AppAccessUser[],
  fallback: string[],
): Promise<string[]> {
  const fromUsers = sortResponsibles(
    users.filter((u) => u.isEncodingResponsible).map((u) => encodingLabel(u)),
  );
  const next = fromUsers.length > 0 ? fromUsers : sortResponsibles(fallback);
  const sb = requireClient();
  const { error } = await sb.from(TABLES.settings).upsert({
    id: KPI_SETTINGS_ID,
    responsibles: next,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`kpi_settings: ${error.message}`);
  return next;
}

export async function listWeeksRel(): Promise<WeeklyRow[]> {
  const sb = requireClient();
  const weeks = await fetchAllRows<WeekRow>(() =>
    sb.from(TABLES.weeks).select("*"),
  );
  return weeks
    .map(weekRowToWeekly)
    .sort((a, b) =>
      a.year === b.year ? b.week - a.week : b.year - a.year,
    );
}

export async function getWeekRel(id: string): Promise<WeeklyRow | null> {
  const sb = requireClient();
  const { data, error } = await sb
    .from(TABLES.weeks)
    .select("*")
    .eq("week_id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? weekRowToWeekly(data as WeekRow) : null;
}

export async function ensureWeekRel(id: string): Promise<WeeklyRow> {
  const existing = await getWeekRel(id);
  if (existing) return existing;
  const year = Number(id.slice(0, 4));
  const week = Number(id.slice(6));
  const month = Math.min(12, Math.ceil(week / 4.345));
  const row = createEmptyWeek(year, month, week);
  const sb = requireClient();
  const { error } = await sb.from(TABLES.weeks).insert(weeklyToWeekRow(row));
  if (error) throw new Error(error.message);
  await bumpRevision(sb);
  return row;
}

export async function updateWeeklyRowRel(
  id: string,
  patch: Partial<WeeklyRow>,
): Promise<WeeklyRow> {
  await ensureWeekRel(id);
  const current = (await getWeekRel(id))!;
  const next: WeeklyRow = {
    ...current,
    ...patch,
    year: current.year,
    week: current.week,
    updatedAt: new Date().toISOString(),
  };
  const sb = requireClient();
  const { error } = await sb
    .from(TABLES.weeks)
    .update(weeklyToWeekRow(next))
    .eq("week_id", id);
  if (error) throw new Error(error.message);
  await bumpRevision(sb);
  return next;
}

export async function getResponsiblesRel(): Promise<string[]> {
  const db = await loadAppDatabaseFromTables();
  const fromUsers = sortResponsibles(
    db.settings.accessUsers
      .filter((u) => u.isEncodingResponsible)
      .map((u) => encodingLabel(u)),
  );
  if (fromUsers.length > 0) return fromUsers;
  return sortResponsibles(db.settings.responsibles);
}

export async function addResponsibleRel(name: string): Promise<string[]> {
  const clean = normalizeResponsibleName(name);
  if (!clean) throw new Error("Nom vide");
  const sb = requireClient();
  const { data, error } = await sb
    .from(TABLES.settings)
    .select("responsibles")
    .eq("id", KPI_SETTINGS_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const current = sortResponsibles(
    (data as SettingsRow | null)?.responsibles ?? [...DEFAULT_RESPONSIBLES],
  );
  const exists = current.some(
    (a) => a.localeCompare(clean, "fr", { sensitivity: "base" }) === 0,
  );
  const next = exists ? current : sortResponsibles([...current, clean]);
  const { error: up } = await sb.from(TABLES.settings).upsert({
    id: KPI_SETTINGS_ID,
    responsibles: next,
    updated_at: new Date().toISOString(),
  });
  if (up) throw new Error(up.message);
  await bumpRevision(sb);
  return next;
}

export async function removeResponsibleRel(name: string): Promise<string[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from(TABLES.settings)
    .select("responsibles")
    .eq("id", KPI_SETTINGS_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const current = (data as SettingsRow | null)?.responsibles ?? [];
  const next = current.filter(
    (a) => a.localeCompare(name.trim(), "fr", { sensitivity: "base" }) !== 0,
  );
  if (next.length === current.length) throw new Error("Personne introuvable");
  if (next.length === 0) throw new Error("Il faut au moins un responsable");
  const sorted = sortResponsibles(next);
  const { error: up } = await sb.from(TABLES.settings).upsert({
    id: KPI_SETTINGS_ID,
    responsibles: sorted,
    updated_at: new Date().toISOString(),
  });
  if (up) throw new Error(up.message);
  await bumpRevision(sb);
  return sorted;
}

export async function getAccessUsersRel(): Promise<AppAccessUser[]> {
  const sb = requireClient();
  const data = await fetchAllRows<AccessRow>(() =>
    sb.from(TABLES.accessUsers).select("*"),
  );
  return normalizeAccessUsers(data.map(accessRowToUser));
}

export async function getAccessRightsForEmailRel(email: string) {
  const users = await getAccessUsersRel();
  return rightsFromAccessEntry(findAccessUser(users, email));
}

export async function recordUserLoginRel(input: {
  email: string;
  displayName?: string;
  avatarUrl?: string;
}): Promise<AppAccessUser> {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) throw new Error("Email invalide");
  const users = await getAccessUsersRel();
  const now = new Date().toISOString();
  const prev = findAccessUser(users, email);
  const next: AppAccessUser = {
    email,
    displayName: input.displayName?.trim() || prev?.displayName || undefined,
    avatarUrl: input.avatarUrl?.trim() || prev?.avatarUrl || undefined,
    isAdmin: Boolean(prev?.isAdmin),
    isKpiResponsible: Boolean(prev?.isKpiResponsible),
    isEncodingResponsible: Boolean(prev?.isEncodingResponsible),
    lastLoginAt: now,
    updatedAt: now,
  };
  const sb = requireClient();
  const { error } = await sb
    .from(TABLES.accessUsers)
    .upsert(userToAccessRow(next), { onConflict: "email" });
  if (error) throw new Error(error.message);
  await bumpRevision(sb);
  return next;
}

export async function upsertAccessUserRel(input: {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  isAdmin: boolean;
  isKpiResponsible: boolean;
  isEncodingResponsible: boolean;
}): Promise<AppAccessUser[]> {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) throw new Error("Email invalide");
  const users = await getAccessUsersRel();
  const prev = findAccessUser(users, email);
  const next: AppAccessUser = {
    email,
    displayName: input.displayName?.trim() || prev?.displayName || undefined,
    avatarUrl: input.avatarUrl?.trim() || prev?.avatarUrl || undefined,
    isAdmin: Boolean(input.isAdmin),
    isKpiResponsible: Boolean(input.isKpiResponsible),
    isEncodingResponsible: Boolean(input.isEncodingResponsible),
    lastLoginAt: prev?.lastLoginAt,
    updatedAt: new Date().toISOString(),
  };
  const draft = normalizeAccessUsers(
    prev
      ? users.map((u) => (u.email === email ? next : u))
      : [...users, next],
  );
  if (!draft.some((u) => u.isAdmin)) {
    throw new Error("Il faut au moins un administrateur");
  }
  const sb = requireClient();
  const { error } = await sb
    .from(TABLES.accessUsers)
    .upsert(userToAccessRow(next), { onConflict: "email" });
  if (error) throw new Error(error.message);
  await syncResponsiblesList(draft, []);
  await bumpRevision(sb);
  return draft;
}

export async function removeAccessUserRel(
  email: string,
): Promise<AppAccessUser[]> {
  const e = normalizeEmail(email);
  const users = await getAccessUsersRel();
  const target = findAccessUser(users, e);
  if (!target) throw new Error("Utilisateur introuvable");
  const draft = users.filter((u) => u.email !== e);
  if (!draft.some((u) => u.isAdmin)) {
    throw new Error("Impossible de retirer le dernier administrateur");
  }
  const sb = requireClient();
  const { error } = await sb.from(TABLES.accessUsers).delete().eq("email", e);
  if (error) throw new Error(error.message);
  await syncResponsiblesList(draft, []);
  await bumpRevision(sb);
  return draft;
}

export async function getPeopleDirectoryRel(): Promise<PeopleDirectory> {
  const sb = requireClient();
  const data = await fetchAllRows<PeopleRow>(() =>
    sb.from(TABLES.people).select("*"),
  );
  return peopleFromRows(data);
}

export async function mergePeopleFromJiraRel(
  people: PersonDirectoryEntry[],
): Promise<PeopleDirectory> {
  if (!people.length) return getPeopleDirectoryRel();
  const current = await getPeopleDirectoryRel();
  const merged = mergePeopleDirectory(current, people);
  const rows: PeopleRow[] = Object.values(merged).map((p) => ({
    display_name: p.displayName,
    account_id: p.accountId ?? null,
    avatar_url: p.avatarUrl ?? null,
    updated_at: p.updatedAt ?? null,
  }));
  const sb = requireClient();
  const { error } = await sb
    .from(TABLES.people)
    .upsert(rows, { onConflict: "display_name" });
  if (error) throw new Error(error.message);
  await bumpRevision(sb);
  return merged;
}

export async function addLogEventRel(
  collection: LogCollection,
  event: Omit<LogEvent, "id" | "year" | "month" | "week"> &
    Partial<Pick<LogEvent, "year" | "month" | "week">>,
): Promise<LogEvent> {
  const responsibles = await getResponsiblesRel();
  const canonical = canonicalResponsible(event.responsible, responsibles);
  if (!canonical) {
    throw new Error(
      `Responsable non autorisé. Choisissez parmi : ${responsibles.join(", ")}`,
    );
  }
  const parts = isoWeekPartsFromDate(event.date);
  const full: LogEvent = {
    id: `${collection}-${randomUUID()}`,
    date: event.date,
    explanation: event.explanation,
    responsible: canonical,
    year: event.year ?? parts.year,
    month: event.month ?? parts.month,
    week: event.week ?? parts.week,
  };
  const kind = COLLECTION_TO_LOG_KIND[collection];
  const sb = requireClient();
  const { error } = await sb.from(TABLES.logEvents).insert({
    id: full.id,
    kind,
    event_date: full.date,
    year: full.year,
    month: full.month,
    week: full.week,
    explanation: full.explanation,
    responsible: full.responsible,
  });
  if (error) throw new Error(error.message);
  await bumpRevision(sb);
  return full;
}

export async function addPhishingEventRel(
  event: Omit<PhishingEvent, "id" | "year" | "month" | "week"> &
    Partial<Pick<PhishingEvent, "year" | "month" | "week">>,
): Promise<PhishingEvent> {
  const parts = isoWeekPartsFromDate(event.date);
  const full: PhishingEvent = {
    id: `phish-${randomUUID()}`,
    date: event.date,
    year: event.year ?? parts.year,
    month: event.month ?? parts.month,
    week: event.week ?? parts.week,
    failures: event.failures ?? 0,
    explanation: event.explanation ?? "",
    responsible: event.responsible ?? "",
  };
  const sb = requireClient();
  const { error } = await sb.from(TABLES.phishing).insert({
    id: full.id,
    event_date: full.date,
    year: full.year,
    month: full.month,
    week: full.week,
    failures: full.failures,
    explanation: full.explanation ?? "",
    responsible: full.responsible ?? "",
  });
  if (error) throw new Error(error.message);
  await bumpRevision(sb);
  return full;
}

export async function deleteLogEventRel(
  collection: LogCollection | "phishing",
  eventId: string,
): Promise<void> {
  const sb = requireClient();
  if (collection === "phishing") {
    const { error } = await sb.from(TABLES.phishing).delete().eq("id", eventId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb
      .from(TABLES.logEvents)
      .delete()
      .eq("id", eventId);
    if (error) throw new Error(error.message);
  }
  await bumpRevision(sb);
}

export async function updateLogEventRel(
  collection: LogCollection,
  eventId: string,
  patch: {
    date: string;
    explanation: string;
    responsible: string;
  },
): Promise<LogEvent> {
  const responsibles = await getResponsiblesRel();
  const canonical = canonicalResponsible(patch.responsible, responsibles);
  if (!canonical) {
    throw new Error(
      `Responsable non autorisé. Choisissez parmi : ${responsibles.join(", ")}`,
    );
  }
  const parts = isoWeekPartsFromDate(patch.date);
  const full: LogEvent = {
    id: eventId,
    date: patch.date,
    explanation: patch.explanation,
    responsible: canonical,
    year: parts.year,
    month: parts.month,
    week: parts.week,
  };
  const kind = COLLECTION_TO_LOG_KIND[collection];
  const sb = requireClient();
  const { error } = await sb
    .from(TABLES.logEvents)
    .update({
      kind,
      event_date: full.date,
      year: full.year,
      month: full.month,
      week: full.week,
      explanation: full.explanation,
      responsible: full.responsible,
    })
    .eq("id", eventId);
  if (error) throw new Error(error.message);
  await bumpRevision(sb);
  return full;
}

export async function updatePhishingEventRel(
  eventId: string,
  patch: { date: string; failures: number },
): Promise<PhishingEvent> {
  const parts = isoWeekPartsFromDate(patch.date);
  const full: PhishingEvent = {
    id: eventId,
    date: patch.date,
    year: parts.year,
    month: parts.month,
    week: parts.week,
    failures: patch.failures ?? 0,
    explanation: "",
    responsible: "",
  };
  const sb = requireClient();
  const { error } = await sb
    .from(TABLES.phishing)
    .update({
      event_date: full.date,
      year: full.year,
      month: full.month,
      week: full.week,
      failures: full.failures,
    })
    .eq("id", eventId);
  if (error) throw new Error(error.message);
  await bumpRevision(sb);
  return full;
}

async function replaceBreakdownDimension(
  weekKey: string,
  dimension: BreakdownDimension,
  bag: Record<string, number>,
): Promise<void> {
  const sb = requireClient();
  const { error: delErr } = await sb
    .from(TABLES.breakdowns)
    .delete()
    .eq("week_id", weekKey)
    .eq("dimension", dimension);
  if (delErr) throw new Error(delErr.message);
  const rows = Object.entries(bag).map(([label, count]) => ({
    week_id: weekKey,
    dimension,
    label,
    count: Math.max(0, Number(count) || 0),
  }));
  if (rows.length) {
    const { error } = await sb.from(TABLES.breakdowns).insert(rows);
    if (error) throw new Error(error.message);
  }
}

export async function setTicketsBreakdownRel(
  weekKey: string,
  byType: Record<string, number>,
  byAssignee: Record<string, number>,
  byRequester?: Record<string, number>,
): Promise<void> {
  await replaceBreakdownDimension(weekKey, "type", byType);
  await replaceBreakdownDimension(weekKey, "assignee", byAssignee);
  if (byRequester !== undefined) {
    await replaceBreakdownDimension(weekKey, "requester", byRequester);
  }
  await bumpRevision();
}

export async function patchTicketsBreakdownRel(
  weekKey: string,
  patch: {
    byType?: Record<string, number>;
    byAssignee?: Record<string, number>;
    byRequester?: Record<string, number>;
  },
): Promise<void> {
  if (patch.byType !== undefined) {
    await replaceBreakdownDimension(weekKey, "type", patch.byType);
  }
  if (patch.byAssignee !== undefined) {
    await replaceBreakdownDimension(weekKey, "assignee", patch.byAssignee);
  }
  if (patch.byRequester !== undefined) {
    await replaceBreakdownDimension(weekKey, "requester", patch.byRequester);
  }
  await bumpRevision();
}

function filterWeekKeys(
  keys: string[],
  options?: { year?: number; weekFrom?: number; weekTo?: number },
): Set<string> {
  const year = options?.year;
  const from = options?.weekFrom ?? 1;
  const to = options?.weekTo ?? 53;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const remove = new Set<string>();
  for (const key of keys) {
    const m = key.match(/^(\d{4})-S(\d{2})$/);
    if (!m) continue;
    const y = Number(m[1]);
    const w = Number(m[2]);
    const inYear = year == null || y === year;
    const inRange =
      options?.weekFrom == null && options?.weekTo == null
        ? true
        : w >= lo && w <= hi;
    const weekOk =
      options?.weekFrom != null || options?.weekTo != null ? inRange : true;
    if (inYear && weekOk) remove.add(key);
  }
  return remove;
}

export async function clearTicketsBreakdownRel(options?: {
  year?: number;
  weekFrom?: number;
  weekTo?: number;
  parts?: BreakdownDimension[];
}): Promise<{ removed: number; remaining: number }> {
  const parts: BreakdownDimension[] =
    options?.parts && options.parts.length > 0
      ? options.parts
      : ["requester"];
  const sb = requireClient();
  const rows = await fetchAllRows<{
    week_id: string;
    dimension: BreakdownDimension;
  }>(() => sb.from(TABLES.breakdowns).select("week_id, dimension"));

  let removed = 0;
  for (const part of parts) {
    const keys = [
      ...new Set(rows.filter((r) => r.dimension === part).map((r) => r.week_id)),
    ];
    const clearAll =
      options?.year == null &&
      options?.weekFrom == null &&
      options?.weekTo == null;
    const toRemove = clearAll ? new Set(keys) : filterWeekKeys(keys, options);
    if (toRemove.size === 0) continue;
    const { error: delErr, count } = await sb
      .from(TABLES.breakdowns)
      .delete({ count: "exact" })
      .eq("dimension", part)
      .in("week_id", [...toRemove]);
    if (delErr) throw new Error(delErr.message);
    removed += count ?? toRemove.size;
  }

  const remainingRows = await fetchAllRows<{
    week_id: string;
    dimension: string;
  }>(() => sb.from(TABLES.breakdowns).select("week_id, dimension"));
  let remaining = 0;
  if (parts.length === 1) {
    remaining = new Set(
      remainingRows
        .filter((r) => r.dimension === parts[0])
        .map((r) => r.week_id),
    ).size;
  } else {
    remaining = new Set(remainingRows.map((r) => `${r.dimension}:${r.week_id}`))
      .size;
  }
  await bumpRevision(sb);
  return { removed, remaining };
}

export async function getRelationalStorageCounts(): Promise<{
  updatedAt: string | null;
  weeks: number;
  assigneeWeeks: number;
  requesterWeeks: number;
  revision: number | null;
}> {
  const sb = requireClient();
  const [meta, weeks, rows] = await Promise.all([
    sb
      .from(TABLES.meta)
      .select("updated_at, revision")
      .eq("id", KPI_META_ID)
      .maybeSingle(),
    sb.from(TABLES.weeks).select("week_id", { count: "exact", head: true }),
    fetchAllRows<Pick<BreakdownRow, "week_id" | "dimension">>(() =>
      sb.from(TABLES.breakdowns).select("week_id, dimension"),
    ),
  ]);
  if (meta.error) throw new Error(meta.error.message);
  const assigneeWeeks = new Set(
    rows.filter((r) => r.dimension === "assignee").map((r) => r.week_id),
  ).size;
  const requesterWeeks = new Set(
    rows.filter((r) => r.dimension === "requester").map((r) => r.week_id),
  ).size;
  return {
    updatedAt: (meta.data as MetaRow | null)?.updated_at ?? null,
    weeks: weeks.count ?? 0,
    assigneeWeeks,
    requesterWeeks,
    revision: (meta.data as MetaRow | null)?.revision ?? null,
  };
}
