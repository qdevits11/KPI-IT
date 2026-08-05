import { promises as fs } from "fs";
import path from "path";
import type {
  AppDatabase,
  LogEvent,
  PhishingEvent,
  WeeklyRow,
} from "./types";
import { weekId } from "./types";
import { seedDatabase, createEmptyWeek } from "./seed";
import {
  isoWeekPartsFromDate,
  mondayOfIsoWeek,
  todayIsoDate,
  weekIdFromDate,
} from "./dates";

/** Sur Vercel le FS du projet est en lecture seule → /tmp ; en local → data/ */
function dbPath(): string {
  if (process.env.VERCEL || process.env.KPI_DB_DIR) {
    const dir = process.env.KPI_DB_DIR || "/tmp/kpi-it";
    return path.join(dir, "db.json");
  }
  return path.join(process.cwd(), "data", "db.json");
}

async function ensureDb(): Promise<AppDatabase> {
  const file = dbPath();
  try {
    const raw = await fs.readFile(file, "utf-8");
    const db = JSON.parse(raw) as AppDatabase;
    if (migrateLogDates(db)) {
      await writeDb(db);
    }
    return db;
  } catch {
    const seeded = seedDatabase();
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(seeded, null, 2), "utf-8");
    } catch {
      // Lecture seule : on sert le seed en mémoire
    }
    return seeded;
  }
}

async function writeDb(db: AppDatabase): Promise<void> {
  const file = dbPath();
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.warn("Persistance KPI indisponible:", err);
  }
}

/** Force re-seed from Excel JSON (dev / import) */
export async function resetFromSeed(): Promise<AppDatabase> {
  const seeded = seedDatabase();
  await writeDb(seeded);
  return seeded;
}

export async function getDatabase(): Promise<AppDatabase> {
  return ensureDb();
}

export function currentWeekId(date = new Date()): string {
  return weekIdFromDate(todayIsoDate(date));
}

export function isoWeekParts(date = new Date()): {
  year: number;
  week: number;
  month: number;
} {
  return isoWeekPartsFromDate(todayIsoDate(date));
}

export async function listWeeks(): Promise<WeeklyRow[]> {
  const db = await ensureDb();
  return [...db.weeks].sort((a, b) =>
    a.year === b.year ? b.week - a.week : b.year - a.year,
  );
}

export async function getWeek(id: string): Promise<WeeklyRow | null> {
  const db = await ensureDb();
  return (
    db.weeks.find((w) => weekId(w) === id) ?? null
  );
}

export async function ensureWeek(id: string): Promise<WeeklyRow> {
  const db = await ensureDb();
  const existing = db.weeks.find((w) => weekId(w) === id);
  if (existing) return existing;

  const year = Number(id.slice(0, 4));
  const week = Number(id.slice(6));
  const month = Math.min(12, Math.ceil(week / 4.345));
  const row = createEmptyWeek(year, month, week);
  db.weeks.push(row);
  await writeDb(db);
  return row;
}

export async function updateWeeklyRow(
  id: string,
  patch: Partial<WeeklyRow>,
): Promise<WeeklyRow> {
  await ensureWeek(id);
  const db = await ensureDb();
  const idx = db.weeks.findIndex((w) => weekId(w) === id);
  db.weeks[idx] = {
    ...db.weeks[idx],
    ...patch,
    year: db.weeks[idx].year,
    week: db.weeks[idx].week,
    updatedAt: new Date().toISOString(),
  };
  await writeDb(db);
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

/** Complète les journaux issus d'anciennes bases sans champ date. */
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

export async function addLogEvent(
  collection: LogCollection,
  event: Omit<LogEvent, "id" | "year" | "month" | "week"> &
    Partial<Pick<LogEvent, "year" | "month" | "week">>,
): Promise<LogEvent> {
  const db = await ensureDb();
  const derived = withDerivedWeek(event);
  const full: LogEvent = {
    explanation: derived.explanation,
    responsible: derived.responsible,
    date: derived.date,
    year: derived.year,
    month: derived.month,
    week: derived.week,
    id: `${collection}-${Date.now()}`,
  };
  db[collection].push(full);
  await writeDb(db);
  return full;
}

export async function addPhishingEvent(
  event: Omit<PhishingEvent, "id" | "year" | "month" | "week"> &
    Partial<Pick<PhishingEvent, "year" | "month" | "week">>,
): Promise<PhishingEvent> {
  const db = await ensureDb();
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
  await writeDb(db);
  return full;
}

export async function deleteLogEvent(
  collection: LogCollection | "phishing",
  eventId: string,
): Promise<void> {
  const db = await ensureDb();
  if (collection === "phishing") {
    db.phishing = db.phishing.filter((e) => e.id !== eventId);
  } else {
    db[collection] = db[collection].filter((e) => e.id !== eventId);
  }
  await writeDb(db);
}

export async function setTicketsBreakdown(
  weekKey: string,
  byType: Record<string, number>,
  byAssignee: Record<string, number>,
): Promise<void> {
  const db = await ensureDb();
  db.ticketsByType[weekKey] = byType;
  db.ticketsByAssignee[weekKey] = byAssignee;
  await writeDb(db);
}
