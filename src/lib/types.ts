/** Modèle KPI·IT — semaines Jira + journaux d’encodage manuel. */

export type DataSource = "jira" | "manuel" | "calcule";

/** Version du schéma applicatif (3 = tables relationnelles Supabase). */
export const APP_SCHEMA_VERSION = 3;

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
  /** # Tickets clôturés — Hebdo (resolutiondate ∈ semaine) */
  demandesClotureesHebdo: number | null;
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
  explanation?: string;
  responsible?: string;
}

import type { PeopleDirectory } from "./avatars";

/** Compte avec droits KPI·IT (cases à cocher). */
export type AppAccessUser = {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  isAdmin: boolean;
  isKpiResponsible: boolean;
  /** Apparaît dans le sélecteur d’encodage manuel. */
  isEncodingResponsible: boolean;
  /** Dernière connexion réussie (OAuth ou email). */
  lastLoginAt?: string;
  updatedAt?: string;
};

export interface AppSettings {
  /** Personnes autorisées comme responsable d'encodage (pas les assignés Jira). */
  responsibles: string[];
  /**
   * Droits applicatifs (admin / KPI / encodage).
   * Géré dans Admin → Utilisateurs.
   */
  accessUsers: AppAccessUser[];
  /** Photos de profil Jira (clé = displayName). */
  peopleDirectory: PeopleDirectory;
}

export function emptyAppSettings(): AppSettings {
  return {
    responsibles: [],
    accessUsers: [],
    peopleDirectory: {},
  };
}

export interface AppDatabase {
  /** Version du schéma JSON (défaut 1 si absent → migré). */
  schemaVersion: number;
  /** Compteur monotone pour détecter les écritures concurrentes. */
  revision: number;
  year: number;
  weeks: WeeklyRow[];
  automationsMetier: LogEvent[];
  automationsOdoo: LogEvent[];
  phishing: PhishingEvent[];
  maintenances: LogEvent[];
  /** Clé = 2026-S31 */
  ticketsByType: Record<string, Record<string, number>>;
  ticketsByAssignee: Record<string, Record<string, number>>;
  /** Ventilation par demandeur (reporter Jira). Clé = 2026-S31 */
  ticketsByRequester: Record<string, Record<string, number>>;
  /**
   * Stock ouvert figé (fin de semaine) par assigné.
   * Distinct de ticketsByAssignee (= tickets créés dans la semaine).
   */
  openByAssignee: Record<string, Record<string, number>>;
  settings: AppSettings;
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
  ticketsByRequester: Record<string, number>;
  /** Stock ouvert figé par assigné (si disponible). */
  openByAssignee: Record<string, number>;
}

/** Dimension d'analyse des tickets. */
export type TicketStatDimension = "assignee" | "requester" | "type";

/** Une ligne d'agrégat (personne, demandeur ou type). */
export interface TicketStatRow {
  name: string;
  total: number;
  /** Clé semaine → nombre */
  byWeek: Record<string, number>;
  share: number;
}

export interface TicketStatsPayload {
  year: number;
  dimension: TicketStatDimension;
  label: string;
  description: string;
  weeks: string[];
  rows: TicketStatRow[];
  grandTotal: number;
  weekTotals: Record<string, number>;
}

/** Ligne de la vue annuelle. */
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
  /** Tickets clôturés pendant la semaine. */
  demandesClotureesHebdo: number | null;
  nonResoluesHebdo: number | null;
  nonResoluesYtd: number;
  fluctuation: string;
  recommandations: string;
}
