import { promises as fs } from "fs";
import path from "path";
import type {
  AppDatabase,
  ManualEntries,
  PeriodData,
  PeriodId,
  JiraTicketStats,
} from "./types";
import { createEmptyManual, createEmptyJira, seedDatabase } from "./seed";

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

export async function getDatabase(): Promise<AppDatabase> {
  return ensureDb();
}

export async function listPeriods(): Promise<PeriodData[]> {
  const db = await ensureDb();
  return [...db.periods].sort((a, b) => b.period.id.localeCompare(a.period.id));
}

export async function getPeriod(id: PeriodId): Promise<PeriodData | null> {
  const db = await ensureDb();
  return db.periods.find((p) => p.period.id === id) ?? null;
}

export async function ensurePeriod(id: PeriodId): Promise<PeriodData> {
  const db = await ensureDb();
  const existing = db.periods.find((p) => p.period.id === id);
  if (existing) return existing;

  const [yearStr, monthStr] = id.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const label = new Date(year, month - 1, 1).toLocaleDateString("fr-BE", {
    month: "long",
    year: "numeric",
  });

  const period: PeriodData = {
    period: { id, label: label.charAt(0).toUpperCase() + label.slice(1), year, month },
    jira: createEmptyJira(),
    manual: createEmptyManual(daysInMonth(year, month)),
  };

  db.periods.push(period);
  await writeDb(db);
  return period;
}

export async function updateManualEntries(
  periodId: PeriodId,
  manual: ManualEntries,
  updatedBy?: string,
): Promise<PeriodData> {
  const db = await ensureDb();
  let period = db.periods.find((p) => p.period.id === periodId);
  if (!period) {
    period = await ensurePeriod(periodId);
    // re-read after ensure
    const refreshed = await ensureDb();
    period = refreshed.periods.find((p) => p.period.id === periodId)!;
    Object.assign(db, refreshed);
  }

  const idx = db.periods.findIndex((p) => p.period.id === periodId);
  db.periods[idx] = {
    ...db.periods[idx],
    manual: {
      ...manual,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy ?? "IT",
    },
  };
  await writeDb(db);
  return db.periods[idx];
}

export async function updateJiraStats(
  periodId: PeriodId,
  jira: JiraTicketStats,
): Promise<PeriodData> {
  await ensurePeriod(periodId);
  const db = await ensureDb();
  const idx = db.periods.findIndex((p) => p.period.id === periodId);
  db.periods[idx] = {
    ...db.periods[idx],
    jira: { ...jira, lastSyncedAt: new Date().toISOString() },
  };
  db.settings.jiraConfigured = true;
  await writeDb(db);
  return db.periods[idx];
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function periodMinutesFor(year: number, month: number): number {
  return daysInMonth(year, month) * 24 * 60;
}

export function currentPeriodId(date = new Date()): PeriodId {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
