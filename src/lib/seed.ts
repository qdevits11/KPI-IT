import type {
  AppDatabase,
  WeeklyRow,
} from "./types";
import { APP_SCHEMA_VERSION, emptyAppSettings } from "./types";
import { isoWeekPartsFromDate, todayIsoDate } from "./dates";
import { DEFAULT_RESPONSIBLES } from "./responsibles";

function emptyWeek(year: number, month: number, week: number): WeeklyRow {
  return {
    year,
    month,
    week,
    ticketsHorsSlaCloture: null,
    ticketsHorsSlaPriseEnCharge: null,
    demandesItHebdo: null,
    demandesClotureesHebdo: null,
    demandesNonResoluesHebdo: null,
    openFrozenAt: null,
    informations: "",
    reaction: "",
    jiraSyncedAt: null,
    updatedAt: null,
  };
}

/**
 * Base vide pour une année civile / ISO.
 * Les données arrivent via sync Jira et encodage manuel — plus de seed Excel.
 */
export function createEmptyDatabase(
  year = isoWeekPartsFromDate(todayIsoDate()).year,
): AppDatabase {
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    revision: 1,
    year,
    weeks: [],
    automationsMetier: [],
    automationsOdoo: [],
    phishing: [],
    maintenances: [],
    ticketsByType: {},
    ticketsByAssignee: {},
    ticketsByRequester: {},
    openByAssignee: {},
    settings: {
      ...emptyAppSettings(),
      responsibles: [...DEFAULT_RESPONSIBLES],
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
