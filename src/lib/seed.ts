import excelSeed from "@/data/seed-from-excel.json";
import type {
  AppDatabase,
  LogEvent,
  PhishingEvent,
  WeeklyRow,
} from "./types";
import { mondayOfIsoWeek } from "./dates";
import { DEFAULT_RESPONSIBLES } from "./responsibles";

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
  ticketsByRequester?: Record<string, Record<string, number>>;
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
    openFrozenAt: null,
    informations: "",
    reaction: "",
    jiraSyncedAt: null,
    updatedAt: null,
  };
}

function toLog(
  rows: ExcelSeed["automationsMetier"],
  prefix: string,
): LogEvent[] {
  return rows.map((r, i) => ({
    id: uid(prefix, i + 1),
    date: mondayOfIsoWeek(r.year, r.week),
    year: r.year,
    month: r.month,
    week: r.week,
    explanation: r.explanation,
    responsible: r.responsible,
  }));
}

export function seedDatabase(): AppDatabase {
  const excel = excelSeed as ExcelSeed;
  const weeks: WeeklyRow[] = excel.weeks.map((w) => ({
    ...emptyWeek(w.year, w.month, w.week),
    ticketsHorsSlaCloture: w.ticketsHorsSlaCloture,
    ticketsHorsSlaPriseEnCharge: w.ticketsHorsSlaPriseEnCharge,
    demandesItHebdo: w.demandesItHebdo,
    demandesNonResoluesHebdo: w.demandesNonResoluesHebdo,
    // Valeurs Excel = stock déjà figé (ne pas écraser par un snapshot live)
    openFrozenAt:
      w.demandesNonResoluesHebdo != null ? "excel-import" : null,
    informations: w.informations,
    reaction: w.reaction,
    updatedAt: new Date().toISOString(),
  }));

  const phishing: PhishingEvent[] = excel.phishing.map((r, i) => ({
    id: uid("phish", i + 1),
    date: mondayOfIsoWeek(r.year, r.week),
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
    // Cloner : le JSON importé est un singleton mutable
    ticketsByType: structuredClone(excel.ticketsByType ?? {}),
    ticketsByAssignee: structuredClone(excel.ticketsByAssignee ?? {}),
    ticketsByRequester: structuredClone(excel.ticketsByRequester ?? {}),
    settings: {
      companyName: "Coverseal / Becoflex",
      jiraConfigured: false,
      responsibles: [...DEFAULT_RESPONSIBLES],
      accessUsers: [],
    },
  };
}

export function createEmptyWeek(
  year: number,
  month: number,
  week: number,
): WeeklyRow {
  return emptyWeek(year, month, week);
}
