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

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

async function ensureDb(): Promise<AppDatabase> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf-8");
    return JSON.parse(raw) as AppDatabase;
  } catch {
    const seeded = seedDatabase();
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DB_PATH, JSON.stringify(seeded, null, 2), "utf-8");
    return seeded;
  }
}

async function writeDb(db: AppDatabase): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
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
  // ISO week
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-S${String(week).padStart(2, "0")}`;
}

export function isoWeekParts(date = new Date()): {
  year: number;
  week: number;
  month: number;
} {
  const id = currentWeekId(date);
  const [y, w] = [Number(id.slice(0, 4)), Number(id.slice(6))];
  return { year: y, week: w, month: date.getMonth() + 1 };
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

export async function addLogEvent(
  collection: LogCollection,
  event: Omit<LogEvent, "id">,
): Promise<LogEvent> {
  const db = await ensureDb();
  const full: LogEvent = {
    ...event,
    id: `${collection}-${Date.now()}`,
  };
  db[collection].push(full);
  await writeDb(db);
  return full;
}

export async function addPhishingEvent(
  event: Omit<PhishingEvent, "id">,
): Promise<PhishingEvent> {
  const db = await ensureDb();
  const full: PhishingEvent = {
    ...event,
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
