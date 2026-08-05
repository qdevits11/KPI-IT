/** Modèle aligné sur Becoflex/KPI.xlsx */

export type DataSource = "jira" | "manuel" | "calcule";

export interface WeekRef {
  year: number;
  month: number;
  week: number; // numéro de semaine ISO (1–53)
}

export function weekId(w: WeekRef): string {
  return `${w.year}-S${String(w.week).padStart(2, "0")}`;
}

export function parseWeekId(id: string): { year: number; week: number } {
  const m = id.match(/^(\d{4})-S(\d{2})$/);
  if (!m) throw new Error(`weekId invalide: ${id}`);
  return { year: Number(m[1]), week: Number(m[2]) };
}

/** Ligne hebdo — feuille « 2026 » (données saisies / Jira) */
export interface WeeklyRow extends WeekRef {
  /** # Tickets hors SLA clôture (User experience / IT Team) */
  ticketsHorsSlaCloture: number | null;
  /** # Tickets hors SLA prise en charge */
  ticketsHorsSlaPriseEnCharge: number | null;
  /** # Demandes IT — Hebdo */
  demandesItHebdo: number | null;
  /** # Demandes non résolues — Hebdo (stock en fin de semaine) */
  demandesNonResoluesHebdo: number | null;
  /**
   * Instant où le stock « non résolus » a été figé (dimanche 23:59 Bruxelles).
   * null = pas encore figé (semaine courante = snapshot live à la sync).
   */
  openFrozenAt: string | null;
  /** Remarque sur la fluctuation des chiffres (retour semaine). */
  informations: string;
  /** Recommandations pour améliorer le service (retour semaine). */
  reaction: string;
  jiraSyncedAt: string | null;
  updatedAt: string | null;
}

/**
 * Événement journal encodable manuellement.
 * Champs saisis : date + (explication + responsable) ou (échecs pour phishing).
 * year / month / week sont dérivés de la date pour les COUNTIFS Excel.
 */
export interface LogEvent {
  id: string;
  /** Date calendaire YYYY-MM-DD */
  date: string;
  year: number;
  month: number;
  week: number;
  explanation: string;
  responsible: string;
}

/** Test phishing raté : seuls date + nombre d'échecs sont encodés. */
export interface PhishingEvent {
  id: string;
  date: string;
  year: number;
  month: number;
  week: number;
  failures: number;
  /** Conservés pour compat seed Excel ; non saisis dans l'UI. */
  explanation?: string;
  responsible?: string;
}

export interface AppDatabase {
  year: number;
  weeks: WeeklyRow[];
  automationsMetier: LogEvent[];
  automationsOdoo: LogEvent[];
  phishing: PhishingEvent[];
  maintenances: LogEvent[];
  /** Clé = 2026-S31 */
  ticketsByType: Record<string, Record<string, number>>;
  ticketsByAssignee: Record<string, Record<string, number>>;
  settings: {
    companyName: string;
    jiraConfigured: boolean;
    /** Personnes autorisées comme responsable à l'encodage. */
    responsibles: string[];
  };
}

export type KpiCategory =
  | "sla"
  | "metier"
  | "odoo"
  | "phishing"
  | "production"
  | "ticketing";

export interface KpiValue {
  id: string;
  category: KpiCategory;
  label: string;
  value: number | null;
  unit: "number";
  target: number | null;
  higherIsBetter: boolean;
  source: DataSource;
  formulaId: string;
  status: "ok" | "warning" | "critical" | "na";
}

export interface FormulaDefinition {
  id: string;
  category: KpiCategory;
  name: string;
  description: string;
  formula: string;
  inputs: { name: string; source: DataSource; description: string }[];
  example: string;
  excelSheet?: string;
}

export interface WeekDashboard {
  week: WeeklyRow;
  kpis: KpiValue[];
  events: {
    automationsMetier: LogEvent[];
    automationsOdoo: LogEvent[];
    phishing: PhishingEvent[];
    maintenances: LogEvent[];
  };
  ticketsByType: Record<string, number>;
  ticketsByAssignee: Record<string, number>;
}

/** Ligne de la vue annuelle (équivalent feuille Excel « 2026 »). */
export interface YearOverviewRow {
  year: number;
  month: number;
  week: number;
  weekKey: string;
  horsSlaCloture: number | null;
  horsSlaPriseEnCharge: number | null;
  automationsMetier: number;
  ameliorationsOdoo: number;
  echecsPhishing: number;
  maintenances: number;
  demandesItHebdo: number | null;
  demandesItYtd: number;
  nonResoluesHebdo: number | null;
  nonResoluesYtd: number;
  fluctuation: string;
  recommandations: string;
}
