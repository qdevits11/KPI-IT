/**
 * Façade de persistance KPI·IT.
 * - Supabase configuré → tables relationnelles (src/lib/db/relational.ts)
 * - Sinon → document JSON local (disque / Blob) pour dev & tests
 */

import { promises as fs } from "fs";
import path from "path";
import type {
  AppAccessUser,
  AppDatabase,
  LogEvent,
  PhishingEvent,
  WeeklyRow,
} from "./types";
import {
  APP_SCHEMA_VERSION,
  emptyAppSettings,
  weekId,
} from "./types";
import { createEmptyDatabase, createEmptyWeek } from "./seed";
import {
  isoWeekPartsFromDate,
  mondayOfIsoWeek,
  todayIsoDate,
  weekIdFromDate,
} from "./dates";
import {
  canonicalResponsible,
  DEFAULT_RESPONSIBLES,
  sortResponsibles,
} from "./responsibles";
import {
  encodingLabel,
  findAccessUser,
  normalizeAccessUsers,
  normalizeEmail,
  rightsFromAccessEntry,
} from "./roles";
import {
  mergePeopleDirectory,
  type PeopleDirectory,
  type PersonDirectoryEntry,
} from "./avatars";
import {
  blobConfigured,
  loadDbFromBlob,
  saveDbToBlob,
  saveDbToBlobIfAbsent,
} from "./db-persist";
import { supabaseConfigured } from "./db/client";
import * as rel from "./db/relational";

/** Sur Vercel le FS du projet est en lecture seule → /tmp ; en local → data/ */
function dbPath(): string {
  if (process.env.VERCEL || process.env.KPI_DB_DIR) {
    const dir = process.env.KPI_DB_DIR || "/tmp/kpi-it";
    return path.join(dir, "db.json");
  }
  return path.join(process.cwd(), "data", "db.json");
}

function cacheKey(): string {
  if (supabaseConfigured()) return `supabase-rel:${dbPath()}`;
  return `file:${dbPath()}`;
}

/** Cache processus — document local uniquement (évite les courses en mode relationnel). */
let memoryDb: AppDatabase | null = null;
let memoryDbPath: string | null = null;

export function resetDbCacheForTests(): void {
  memoryDb = null;
  memoryDbPath = null;
  rel.invalidateRelationalDbCache();
}

function setMemory(db: AppDatabase): AppDatabase {
  memoryDb = db;
  memoryDbPath = cacheKey();
  return db;
}

function relationalEnabled(): boolean {
  return supabaseConfigured();
}

async function writeDiskQuiet(db: AppDatabase): Promise<void> {
  const file = dbPath();
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.warn("Persistance KPI disque indisponible:", err);
  }
}

async function migrateAndMaybePersist(db: AppDatabase): Promise<AppDatabase> {
  let dirty = migrateLogDates(db);
  if (migrateSchema(db)) dirty = true;
  if (migrateSettings(db)) dirty = true;
  if (migrateTicketRequester(db)) dirty = true;
  if (migrateOpenByAssignee(db)) dirty = true;
  setMemory(db);
  if (dirty) {
    await writeDocumentDb(db);
  }
  return db;
}

async function readDbFromDisk(): Promise<AppDatabase | null> {
  const file = dbPath();
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as AppDatabase;
  } catch {
    return null;
  }
}

/**
 * Mode document (dev / tests sans Supabase).
 */
async function ensureDocumentDb(): Promise<AppDatabase> {
  if (memoryDb && memoryDbPath === cacheKey()) {
    return memoryDb;
  }

  const fromDisk = await readDbFromDisk();
  if (fromDisk) {
    return migrateAndMaybePersist(fromDisk);
  }

  const fromBlob = await loadDbFromBlob();
  if (fromBlob) {
    await writeDiskQuiet(fromBlob);
    return migrateAndMaybePersist(fromBlob);
  }

  if (process.env.VERCEL && !blobConfigured()) {
    console.warn(
      "KPI: ni Supabase ni Blob configurés — les syncs Jira seront perdus " +
        "à chaque cold start. Définissez SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const empty = createEmptyDatabase();
  setMemory(empty);
  await writeDiskQuiet(empty);
  await saveDbToBlobIfAbsent(empty);
  return empty;
}

async function writeDocumentDb(db: AppDatabase): Promise<void> {
  db.revision = (Number(db.revision) || 0) + 1;
  db.schemaVersion = APP_SCHEMA_VERSION;
  setMemory(db);
  await writeDiskQuiet(db);
  if (!supabaseConfigured()) {
    await saveDbToBlob(db);
  }
}

async function ensureDb(): Promise<AppDatabase> {
  if (relationalEnabled()) {
    return rel.loadAppDatabaseFromTables();
  }
  return ensureDocumentDb();
}

export async function getDatabase(): Promise<AppDatabase> {
  return ensureDb();
}

export function currentWeekId(date = new Date()): string {
  return weekIdFromDate(todayIsoDate(date));
}

export async function listWeeks(): Promise<WeeklyRow[]> {
  if (relationalEnabled()) return rel.listWeeksRel();
  const db = await ensureDocumentDb();
  return [...db.weeks].sort((a, b) =>
    a.year === b.year ? b.week - a.week : b.year - a.year,
  );
}

export async function getWeek(id: string): Promise<WeeklyRow | null> {
  if (relationalEnabled()) return rel.getWeekRel(id);
  const db = await ensureDocumentDb();
  return db.weeks.find((w) => weekId(w) === id) ?? null;
}

export async function ensureWeek(id: string): Promise<WeeklyRow> {
  if (relationalEnabled()) return rel.ensureWeekRel(id);
  const db = await ensureDocumentDb();
  const existing = db.weeks.find((w) => weekId(w) === id);
  if (existing) return existing;

  const year = Number(id.slice(0, 4));
  const week = Number(id.slice(6));
  const month = Math.min(12, Math.ceil(week / 4.345));
  const row = createEmptyWeek(year, month, week);
  db.weeks.push(row);
  await writeDocumentDb(db);
  return row;
}

export async function updateWeeklyRow(
  id: string,
  patch: Partial<WeeklyRow>,
): Promise<WeeklyRow> {
  if (relationalEnabled()) return rel.updateWeeklyRowRel(id, patch);
  await ensureWeek(id);
  const db = await ensureDocumentDb();
  const idx = db.weeks.findIndex((w) => weekId(w) === id);
  db.weeks[idx] = {
    ...db.weeks[idx],
    ...patch,
    year: db.weeks[idx].year,
    week: db.weeks[idx].week,
    updatedAt: new Date().toISOString(),
  };
  await writeDocumentDb(db);
  return db.weeks[idx];
}

type LogCollection =
  | "automationsMetier"
  | "automationsOdoo"
  | "maintenances";

type IsoWeekParts = {
  year: number;
  week: number;
  month: number;
};

function withDerivedWeek<T extends { date: string }>(
  event: T,
): T & IsoWeekParts {
  const parts = isoWeekPartsFromDate(event.date);
  return { ...event, ...parts };
}

function migrateLogDates(db: AppDatabase): boolean {
  let changed = false;
  const fill = <T extends { year: number; week: number; date?: string }>(
    rows: T[],
  ) => {
    for (const row of rows) {
      if (!row.date) {
        row.date = mondayOfIsoWeek(row.year, row.week);
        changed = true;
      }
    }
  };
  fill(db.automationsMetier);
  fill(db.automationsOdoo);
  fill(db.maintenances);
  fill(db.phishing);
  return changed;
}

function migrateSchema(db: AppDatabase): boolean {
  let changed = false;
  if (typeof db.schemaVersion !== "number" || db.schemaVersion < 1) {
    db.schemaVersion = APP_SCHEMA_VERSION;
    changed = true;
  } else if (db.schemaVersion < APP_SCHEMA_VERSION) {
    db.schemaVersion = APP_SCHEMA_VERSION;
    changed = true;
  }
  if (typeof db.revision !== "number" || !Number.isFinite(db.revision)) {
    db.revision = 1;
    changed = true;
  }
  return changed;
}

function migrateSettings(db: AppDatabase): boolean {
  let changed = false;
  if (!db.settings) {
    db.settings = {
      ...emptyAppSettings(),
      responsibles: [...DEFAULT_RESPONSIBLES],
      accessUsers: normalizeAccessUsers(null),
    };
    return true;
  }
  const legacy = db.settings as AppDatabase["settings"] & {
    companyName?: string;
    jiraConfigured?: boolean;
  };
  if ("companyName" in legacy) {
    delete legacy.companyName;
    changed = true;
  }
  if ("jiraConfigured" in legacy) {
    delete legacy.jiraConfigured;
    changed = true;
  }
  if (!Array.isArray(db.settings.responsibles) || db.settings.responsibles.length === 0) {
    db.settings.responsibles = [...DEFAULT_RESPONSIBLES];
    changed = true;
  }
  const before = JSON.stringify(db.settings.accessUsers ?? null);
  db.settings.accessUsers = normalizeAccessUsers(db.settings.accessUsers);
  if (migrateEncodingFlagsFromResponsibles(db)) {
    changed = true;
  }
  if (JSON.stringify(db.settings.accessUsers) !== before) {
    changed = true;
  }
  if (syncResponsiblesFromAccessUsers(db)) {
    changed = true;
  }
  if (!db.settings.peopleDirectory || typeof db.settings.peopleDirectory !== "object") {
    db.settings.peopleDirectory = {};
    changed = true;
  }
  return changed;
}

function migrateEncodingFlagsFromResponsibles(db: AppDatabase): boolean {
  const names = db.settings.responsibles ?? [];
  if (!names.length) return false;
  let changed = false;
  for (const user of db.settings.accessUsers) {
    if (user.isEncodingResponsible) continue;
    const label = encodingLabel(user);
    const match = names.some(
      (n) =>
        n.localeCompare(label, "fr", { sensitivity: "base" }) === 0 ||
        (user.displayName &&
          n.localeCompare(user.displayName, "fr", { sensitivity: "base" }) ===
            0),
    );
    if (match) {
      user.isEncodingResponsible = true;
      changed = true;
    }
  }
  return changed;
}

function syncResponsiblesFromAccessUsers(db: AppDatabase): boolean {
  const fromUsers = sortResponsibles(
    db.settings.accessUsers
      .filter((u) => u.isEncodingResponsible)
      .map((u) => encodingLabel(u)),
  );
  if (fromUsers.length === 0) return false;
  const prev = JSON.stringify(db.settings.responsibles ?? []);
  const next = JSON.stringify(fromUsers);
  if (prev === next) return false;
  db.settings.responsibles = fromUsers;
  return true;
}

function migrateOpenByAssignee(db: AppDatabase): boolean {
  if (!db.openByAssignee) {
    db.openByAssignee = {};
    return true;
  }
  return false;
}

function migrateTicketRequester(db: AppDatabase): boolean {
  if (!db.ticketsByRequester) {
    db.ticketsByRequester = {};
    return true;
  }
  return false;
}

export async function getResponsibles(): Promise<string[]> {
  if (relationalEnabled()) return rel.getResponsiblesRel();
  const db = await ensureDocumentDb();
  const fromUsers = sortResponsibles(
    db.settings.accessUsers
      .filter((u) => u.isEncodingResponsible)
      .map((u) => encodingLabel(u)),
  );
  if (fromUsers.length > 0) return fromUsers;
  return sortResponsibles(db.settings.responsibles);
}

export async function getAccessUsers(): Promise<AppAccessUser[]> {
  if (relationalEnabled()) return rel.getAccessUsersRel();
  const db = await ensureDocumentDb();
  return normalizeAccessUsers(db.settings.accessUsers);
}

export async function getAccessRightsForEmail(email: string): Promise<{
  isAdmin: boolean;
  isKpiResponsible: boolean;
  isEncodingResponsible: boolean;
}> {
  if (relationalEnabled()) return rel.getAccessRightsForEmailRel(email);
  const users = await getAccessUsers();
  return rightsFromAccessEntry(findAccessUser(users, email));
}

export async function recordUserLogin(input: {
  email: string;
  displayName?: string;
  avatarUrl?: string;
}): Promise<AppAccessUser> {
  if (relationalEnabled()) return rel.recordUserLoginRel(input);
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    throw new Error("Email invalide");
  }
  const db = await ensureDocumentDb();
  const users = normalizeAccessUsers(db.settings.accessUsers);
  const now = new Date().toISOString();
  const idx = users.findIndex((u) => u.email === email);
  const prev = idx >= 0 ? users[idx] : undefined;
  const next: AppAccessUser = {
    email,
    displayName:
      input.displayName?.trim() || prev?.displayName || undefined,
    avatarUrl: input.avatarUrl?.trim() || prev?.avatarUrl || undefined,
    isAdmin: Boolean(prev?.isAdmin),
    isKpiResponsible: Boolean(prev?.isKpiResponsible),
    isEncodingResponsible: Boolean(prev?.isEncodingResponsible),
    lastLoginAt: now,
    updatedAt: now,
  };
  const draft =
    idx >= 0
      ? users.map((u, i) => (i === idx ? next : u))
      : [...users, next];
  db.settings.accessUsers = draft.sort((a, b) =>
    a.email.localeCompare(b.email, "fr"),
  );
  await writeDocumentDb(db);
  return next;
}

export async function upsertAccessUser(input: {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  isAdmin: boolean;
  isKpiResponsible: boolean;
  isEncodingResponsible: boolean;
}): Promise<AppAccessUser[]> {
  if (relationalEnabled()) return rel.upsertAccessUserRel(input);
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    throw new Error("Email invalide");
  }

  const db = await ensureDocumentDb();
  const users = normalizeAccessUsers(db.settings.accessUsers);
  const idx = users.findIndex((u) => u.email === email);
  const prev = idx >= 0 ? users[idx] : undefined;
  const next: AppAccessUser = {
    email,
    displayName:
      input.displayName?.trim() || prev?.displayName || undefined,
    avatarUrl: input.avatarUrl?.trim() || prev?.avatarUrl || undefined,
    isAdmin: Boolean(input.isAdmin),
    isKpiResponsible: Boolean(input.isKpiResponsible),
    isEncodingResponsible: Boolean(input.isEncodingResponsible),
    lastLoginAt: prev?.lastLoginAt,
    updatedAt: new Date().toISOString(),
  };

  const draft =
    idx >= 0
      ? users.map((u, i) => (i === idx ? next : u))
      : [...users, next];

  if (!draft.some((u) => u.isAdmin)) {
    throw new Error("Il faut au moins un administrateur");
  }

  db.settings.accessUsers = draft.sort((a, b) =>
    a.email.localeCompare(b.email, "fr"),
  );
  syncResponsiblesFromAccessUsers(db);
  await writeDocumentDb(db);
  return db.settings.accessUsers;
}

export async function removeAccessUser(email: string): Promise<AppAccessUser[]> {
  if (relationalEnabled()) return rel.removeAccessUserRel(email);
  const e = normalizeEmail(email);
  const db = await ensureDocumentDb();
  const users = normalizeAccessUsers(db.settings.accessUsers);
  const target = findAccessUser(users, e);
  if (!target) {
    throw new Error("Utilisateur introuvable");
  }
  const draft = users.filter((u) => u.email !== e);
  if (!draft.some((u) => u.isAdmin)) {
    throw new Error("Impossible de retirer le dernier administrateur");
  }
  db.settings.accessUsers = draft;
  syncResponsiblesFromAccessUsers(db);
  await writeDocumentDb(db);
  return db.settings.accessUsers;
}

export async function getPeopleDirectory(): Promise<PeopleDirectory> {
  if (relationalEnabled()) return rel.getPeopleDirectoryRel();
  const db = await ensureDocumentDb();
  return db.settings.peopleDirectory ?? {};
}

export async function mergePeopleFromJira(
  people: PersonDirectoryEntry[],
): Promise<PeopleDirectory> {
  if (relationalEnabled()) return rel.mergePeopleFromJiraRel(people);
  if (!people.length) {
    return getPeopleDirectory();
  }
  const db = await ensureDocumentDb();
  db.settings.peopleDirectory = mergePeopleDirectory(
    db.settings.peopleDirectory,
    people,
  );
  await writeDocumentDb(db);
  return db.settings.peopleDirectory;
}

export async function addLogEvent(
  collection: LogCollection,
  event: Omit<LogEvent, "id" | "year" | "month" | "week"> &
    Partial<Pick<LogEvent, "year" | "month" | "week">>,
): Promise<LogEvent> {
  if (relationalEnabled()) return rel.addLogEventRel(collection, event);
  const db = await ensureDocumentDb();
  const canonical = canonicalResponsible(
    event.responsible,
    db.settings.responsibles,
  );
  if (!canonical) {
    throw new Error(
      `Responsable non autorisé. Choisissez parmi : ${db.settings.responsibles.join(", ")}`,
    );
  }
  const derived = withDerivedWeek(event);
  const full: LogEvent = {
    explanation: derived.explanation,
    responsible: canonical,
    date: derived.date,
    year: derived.year,
    month: derived.month,
    week: derived.week,
    id: `${collection}-${Date.now()}`,
  };
  db[collection].push(full);
  await writeDocumentDb(db);
  return full;
}

export async function addPhishingEvent(
  event: Omit<PhishingEvent, "id" | "year" | "month" | "week"> &
    Partial<Pick<PhishingEvent, "year" | "month" | "week">>,
): Promise<PhishingEvent> {
  if (relationalEnabled()) return rel.addPhishingEventRel(event);
  const db = await ensureDocumentDb();
  const derived = withDerivedWeek(event);
  const full: PhishingEvent = {
    date: derived.date,
    year: derived.year,
    month: derived.month,
    week: derived.week,
    failures: derived.failures,
    explanation: derived.explanation ?? "",
    responsible: derived.responsible ?? "",
    id: `phish-${Date.now()}`,
  };
  db.phishing.push(full);
  await writeDocumentDb(db);
  return full;
}

export async function deleteLogEvent(
  collection: LogCollection | "phishing",
  eventId: string,
): Promise<void> {
  if (relationalEnabled()) return rel.deleteLogEventRel(collection, eventId);
  const db = await ensureDocumentDb();
  if (collection === "phishing") {
    db.phishing = db.phishing.filter((e) => e.id !== eventId);
  } else {
    db[collection] = db[collection].filter((e) => e.id !== eventId);
  }
  await writeDocumentDb(db);
}

export async function updateLogEvent(
  collection: LogCollection,
  eventId: string,
  patch: { date: string; explanation: string; responsible: string },
): Promise<LogEvent> {
  if (relationalEnabled()) {
    return rel.updateLogEventRel(collection, eventId, patch);
  }
  const db = await ensureDocumentDb();
  const canonical = canonicalResponsible(
    patch.responsible,
    db.settings.responsibles,
  );
  if (!canonical) {
    throw new Error(
      `Responsable non autorisé. Choisissez parmi : ${db.settings.responsibles.join(", ")}`,
    );
  }
  const list = db[collection];
  const idx = list.findIndex((e) => e.id === eventId);
  if (idx < 0) throw new Error("Événement introuvable");
  const derived = withDerivedWeek({
    date: patch.date,
    explanation: patch.explanation,
    responsible: canonical,
  });
  list[idx] = {
    id: eventId,
    date: derived.date,
    explanation: derived.explanation,
    responsible: canonical,
    year: derived.year,
    month: derived.month,
    week: derived.week,
  };
  await writeDocumentDb(db);
  return list[idx];
}

export async function updatePhishingEvent(
  eventId: string,
  patch: { date: string; failures: number },
): Promise<PhishingEvent> {
  if (relationalEnabled()) {
    return rel.updatePhishingEventRel(eventId, patch);
  }
  const db = await ensureDocumentDb();
  const idx = db.phishing.findIndex((e) => e.id === eventId);
  if (idx < 0) throw new Error("Événement introuvable");
  const derived = withDerivedWeek({
    date: patch.date,
    failures: patch.failures,
  });
  db.phishing[idx] = {
    id: eventId,
    date: derived.date,
    year: derived.year,
    month: derived.month,
    week: derived.week,
    failures: derived.failures ?? 0,
    explanation: db.phishing[idx].explanation ?? "",
    responsible: db.phishing[idx].responsible ?? "",
  };
  await writeDocumentDb(db);
  return db.phishing[idx];
}

export async function setTicketsBreakdown(
  weekKey: string,
  byType: Record<string, number>,
  byAssignee: Record<string, number>,
  byRequester?: Record<string, number>,
): Promise<void> {
  if (relationalEnabled()) {
    return rel.setTicketsBreakdownRel(weekKey, byType, byAssignee, byRequester);
  }
  const db = await ensureDocumentDb();
  if (!db.ticketsByRequester) db.ticketsByRequester = {};
  db.ticketsByType[weekKey] = byType;
  db.ticketsByAssignee[weekKey] = byAssignee;
  if (byRequester !== undefined) {
    db.ticketsByRequester[weekKey] = byRequester;
  }
  await writeDocumentDb(db);
}

export async function patchTicketsBreakdown(
  weekKey: string,
  patch: {
    byType?: Record<string, number>;
    byAssignee?: Record<string, number>;
    byRequester?: Record<string, number>;
  },
): Promise<void> {
  if (relationalEnabled()) return rel.patchTicketsBreakdownRel(weekKey, patch);
  const db = await ensureDocumentDb();
  if (!db.ticketsByRequester) db.ticketsByRequester = {};
  if (patch.byType !== undefined) db.ticketsByType[weekKey] = patch.byType;
  if (patch.byAssignee !== undefined) {
    db.ticketsByAssignee[weekKey] = patch.byAssignee;
  }
  if (patch.byRequester !== undefined) {
    db.ticketsByRequester[weekKey] = patch.byRequester;
  }
  await writeDocumentDb(db);
}

/** Figement stock ouvert par assigné (fin de semaine). */
export async function setOpenByAssignee(
  weekKey: string,
  byAssignee: Record<string, number>,
): Promise<void> {
  if (relationalEnabled()) {
    return rel.setOpenByAssigneeRel(weekKey, byAssignee);
  }
  const db = await ensureDocumentDb();
  if (!db.openByAssignee) db.openByAssignee = {};
  db.openByAssignee[weekKey] = byAssignee;
  await writeDocumentDb(db);
}

export async function getOpenByAssignee(
  weekKey: string,
): Promise<Record<string, number>> {
  if (relationalEnabled()) {
    return rel.getOpenByAssigneeRel(weekKey);
  }
  const db = await ensureDocumentDb();
  return db.openByAssignee?.[weekKey] ?? {};
}

export type BreakdownPart = "type" | "assignee" | "requester" | "open_assignee";

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

export async function clearTicketsBreakdown(options?: {
  year?: number;
  weekFrom?: number;
  weekTo?: number;
  parts?: BreakdownPart[];
}): Promise<{ removed: number; remaining: number }> {
  if (relationalEnabled()) return rel.clearTicketsBreakdownRel(options);
  const db = await ensureDocumentDb();
  if (!db.ticketsByRequester) db.ticketsByRequester = {};
  const parts: BreakdownPart[] =
    options?.parts && options.parts.length > 0
      ? options.parts
      : ["requester"];

  if (!db.openByAssignee) db.openByAssignee = {};
  const collections: Record<
    BreakdownPart,
    Record<string, Record<string, number>>
  > = {
    type: db.ticketsByType,
    assignee: db.ticketsByAssignee,
    requester: db.ticketsByRequester,
    open_assignee: db.openByAssignee,
  };

  let removed = 0;
  let remaining = 0;

  for (const part of parts) {
    const bag = collections[part] ?? {};
    const before = Object.keys(bag).length;
    if (
      options?.year == null &&
      options?.weekFrom == null &&
      options?.weekTo == null
    ) {
      collections[part] = {};
      removed += before;
    } else {
      const toRemove = filterWeekKeys(Object.keys(bag), options);
      const next: Record<string, Record<string, number>> = {};
      for (const [key, value] of Object.entries(bag)) {
        if (toRemove.has(key)) continue;
        next[key] = value;
      }
      collections[part] = next;
      removed += before - Object.keys(next).length;
      remaining += Object.keys(next).length;
    }
  }

  if (parts.includes("type")) db.ticketsByType = collections.type;
  if (parts.includes("assignee")) db.ticketsByAssignee = collections.assignee;
  if (parts.includes("requester")) {
    db.ticketsByRequester = collections.requester;
  }
  if (parts.includes("open_assignee")) {
    db.openByAssignee = collections.open_assignee;
  }
  await writeDocumentDb(db);

  if (parts.length === 1) {
    remaining = Object.keys(collections[parts[0]]).length;
  }

  return { removed, remaining };
}
