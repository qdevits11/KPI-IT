/** Types du modèle de données KPI IT */

export type PeriodId = string; // format YYYY-MM

export type DataSource = "jira" | "manuel";

export interface Period {
  id: PeriodId;
  label: string;
  year: number;
  month: number;
}

/** Statistiques tickets issues de Jira */
export interface JiraTicketStats {
  created: number;
  resolved: number;
  open: number;
  /** Somme des délais de résolution en heures (tickets résolus) */
  totalResolutionHours: number;
  resolvedWithSlaMet: number;
  resolvedWithSlaTracked: number;
  byPriority: {
    highest: number;
    high: number;
    medium: number;
    low: number;
    lowest: number;
  };
  lastSyncedAt: string | null;
}

/** Mise à jour des appareils (saisie manuelle) */
export interface DeviceUpdateEntry {
  devicesTotal: number;
  devicesUpToDate: number;
  campaignName: string;
  notes: string;
}

/** Automatisations Odoo (saisie manuelle) */
export interface OdooAutomationEntry {
  activeAutomations: number;
  newThisPeriod: number;
  successfulRuns: number;
  totalRuns: number;
  notes: string;
}

/** Automatisations métier (saisie manuelle) */
export interface BusinessAutomationEntry {
  activeAutomations: number;
  newThisPeriod: number;
  estimatedHoursSaved: number;
  notes: string;
}

/** Tests de phishing (saisie manuelle) */
export interface PhishingTestEntry {
  participants: number;
  clicked: number;
  reported: number;
  campaignName: string;
  notes: string;
}

/** Maintenance production (saisie manuelle) */
export interface ProductionMaintenanceEntry {
  plannedInterventions: number;
  completedInterventions: number;
  unplannedIncidents: number;
  /** Minutes d'indisponibilité sur la période */
  downtimeMinutes: number;
  /** Minutes totales de la période (ex. 30j * 24h * 60) — défaut calculé */
  periodMinutes: number;
  notes: string;
}

export interface ManualEntries {
  deviceUpdates: DeviceUpdateEntry;
  odooAutomations: OdooAutomationEntry;
  businessAutomations: BusinessAutomationEntry;
  phishingTests: PhishingTestEntry;
  productionMaintenance: ProductionMaintenanceEntry;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface PeriodData {
  period: Period;
  jira: JiraTicketStats;
  manual: ManualEntries;
}

export interface KpiValue {
  id: string;
  category: KpiCategory;
  label: string;
  value: number | null;
  unit: "number" | "percent" | "hours" | "minutes";
  target: number | null;
  /** true = plus haut = mieux ; false = plus bas = mieux */
  higherIsBetter: boolean;
  source: DataSource;
  formulaId: string;
  status: "ok" | "warning" | "critical" | "na";
}

export type KpiCategory =
  | "tickets"
  | "appareils"
  | "odoo"
  | "metier"
  | "phishing"
  | "production";

export interface FormulaDefinition {
  id: string;
  category: KpiCategory;
  name: string;
  description: string;
  formula: string;
  inputs: { name: string; source: DataSource; description: string }[];
  example: string;
}

export interface AppDatabase {
  periods: PeriodData[];
  settings: {
    jiraConfigured: boolean;
    companyName: string;
  };
}
