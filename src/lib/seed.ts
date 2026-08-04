import { readFileSync, existsSync } from "fs";
import path from "path";
import type {
  AppDatabase,
  LogEvent,
  PhishingEvent,
  WeeklyRow,
} from "./types";

function uid(prefix: string, i: number): string {
  return `${prefix}-${i}`;
}

interface ExcelSeed {
  year: number;
  weeks: Array<{
    year: number;
    month: number;
    week: number;
    ticketsHorsSlaCloture: number | null;
    ticketsHorsSlaPriseEnCharge: number | null;
    demandesItHebdo: number | null;
    demandesNonResoluesHebdo: number | null;
    informations: string;
    reaction: string;
  }>;
  automationsMetier: Array<{
    year: number;
    month: number;
    week: number;
    explanation: string;
    responsible: string;
  }>;
  automationsOdoo: Array<{
    year: number;
    month: number;
    week: number;
    explanation: string;
    responsible: string;
  }>;
  phishing: Array<{
    year: number;
    month: number;
    week: number;
    explanation: string;
    responsible: string;
    failures: number;
  }>;
  maintenances: Array<{
    year: number;
    month: number;
    week: number;
    explanation: string;
    responsible: string;
  }>;
  ticketsByType: Record<string, Record<string, number>>;
  ticketsByAssignee: Record<string, Record<string, number>>;
}

function emptyWeek(year: number, month: number, week: number): WeeklyRow {
  return {
    year,
    month,
    week,
    ticketsHorsSlaCloture: null,
    ticketsHorsSlaPriseEnCharge: null,
    demandesItHebdo: null,
    demandesNonResoluesHebdo: null,
    informations: "",
    reaction: "",
    jiraSyncedAt: null,
    updatedAt: null,
  };
}

function loadExcelSeed(): ExcelSeed | null {
  const p = path.join(process.cwd(), "data", "seed-from-excel.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as ExcelSeed;
}

function toLog(
  rows: ExcelSeed["automationsMetier"],
  prefix: string,
): LogEvent[] {
  return rows.map((r, i) => ({
    id: uid(prefix, i + 1),
    year: r.year,
    month: r.month,
    week: r.week,
    explanation: r.explanation,
    responsible: r.responsible,
  }));
}

export function seedDatabase(): AppDatabase {
  const excel = loadExcelSeed();
  if (excel) {
    const weeks: WeeklyRow[] = excel.weeks.map((w) => ({
      ...emptyWeek(w.year, w.month, w.week),
      ticketsHorsSlaCloture: w.ticketsHorsSlaCloture,
      ticketsHorsSlaPriseEnCharge: w.ticketsHorsSlaPriseEnCharge,
      demandesItHebdo: w.demandesItHebdo,
      demandesNonResoluesHebdo: w.demandesNonResoluesHebdo,
      informations: w.informations,
      reaction: w.reaction,
      updatedAt: new Date().toISOString(),
    }));

    const phishing: PhishingEvent[] = excel.phishing.map((r, i) => ({
      id: uid("phish", i + 1),
      year: r.year,
      month: r.month,
      week: r.week,
      explanation: r.explanation,
      responsible: r.responsible,
      failures: r.failures,
    }));

    return {
      year: excel.year,
      weeks,
      automationsMetier: toLog(excel.automationsMetier, "metier"),
      automationsOdoo: toLog(excel.automationsOdoo, "odoo"),
      phishing,
      maintenances: toLog(excel.maintenances, "maint"),
      ticketsByType: excel.ticketsByType,
      ticketsByAssignee: excel.ticketsByAssignee,
      settings: {
        companyName: "Coverseal / Becoflex",
        jiraConfigured: false,
      },
    };
  }

  // Fallback minimal si seed Excel absent
  const year = new Date().getFullYear();
  return {
    year,
    weeks: Array.from({ length: 52 }, (_, i) =>
      emptyWeek(year, Math.ceil((i + 1) / 4.5), i + 1),
    ),
    automationsMetier: [],
    automationsOdoo: [],
    phishing: [],
    maintenances: [],
    ticketsByType: {},
    ticketsByAssignee: {},
    settings: { companyName: "Coverseal / Becoflex", jiraConfigured: false },
  };
}

export function createEmptyWeek(
  year: number,
  month: number,
  week: number,
): WeeklyRow {
  return emptyWeek(year, month, week);
}
