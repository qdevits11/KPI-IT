/** Noms des tables Postgres KPI·IT (schéma relationnel). */

export const KPI_META_ID = "default";
export const KPI_SETTINGS_ID = "default";

export const TABLES = {
  meta: "kpi_meta",
  weeks: "kpi_weeks",
  logEvents: "kpi_log_events",
  phishing: "kpi_phishing_events",
  breakdowns: "kpi_ticket_breakdowns",
  accessUsers: "kpi_access_users",
  people: "kpi_people",
  settings: "kpi_settings",
  jiraConnection: "kpi_jira_connection",
  /** Archive JSON legacy — plus source de vérité. */
  appStateArchive: "kpi_app_state",
} as const;

export type LogEventKind = "metier" | "odoo" | "maintenance";
export type BreakdownDimension = "type" | "assignee" | "requester";

export const LOG_KIND_TO_COLLECTION = {
  metier: "automationsMetier",
  odoo: "automationsOdoo",
  maintenance: "maintenances",
} as const;

export const COLLECTION_TO_LOG_KIND = {
  automationsMetier: "metier",
  automationsOdoo: "odoo",
  maintenances: "maintenance",
} as const;
