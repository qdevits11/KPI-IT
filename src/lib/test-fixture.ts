import type { AppDatabase, LogEvent, PhishingEvent, WeeklyRow } from "./types";
import { APP_SCHEMA_VERSION, emptyAppSettings } from "./types";

function week(
  year: number,
  month: number,
  weekNum: number,
  patch: Partial<WeeklyRow> = {},
): WeeklyRow {
  return {
    year,
    month,
    week: weekNum,
    ticketsHorsSlaCloture: null,
    ticketsHorsSlaPriseEnCharge: null,
    demandesItHebdo: null,
    demandesNonResoluesHebdo: null,
    openFrozenAt: null,
    informations: "",
    reaction: "",
    jiraSyncedAt: null,
    updatedAt: null,
    ...patch,
  };
}

function log(
  id: string,
  year: number,
  month: number,
  weekNum: number,
  explanation: string,
  responsible: string,
): LogEvent {
  return {
    id,
    date: `${year}-${String(month).padStart(2, "0")}-01`,
    year,
    month,
    week: weekNum,
    explanation,
    responsible,
  };
}

/** Jeu de données minimal pour les tests unitaires (sans Excel). */
export function createFormulaTestDatabase(): AppDatabase {
  const weeks: WeeklyRow[] = [];
  for (let w = 1; w <= 31; w++) {
    const month = Math.min(12, Math.ceil(w / 4.345));
    weeks.push(
      week(2026, month, w, {
        // YTD S31 demandes = 30×35 + 40 = 1090
        demandesItHebdo: w === 31 ? 40 : 35,
        // YTD S31 non résolues = 30×52 + 57 = 1617
        demandesNonResoluesHebdo: w === 31 ? 57 : 52,
        openFrozenAt: w < 31 ? "frozen-test" : null,
        informations: w === 31 ? "formation Bandi" : "",
        reaction: w === 31 ? "suivre la formation" : "",
      }),
    );
  }

  const automationsMetier: LogEvent[] = [
    log("m1", 2026, 5, 19, "FLUX B2C", "Gary"),
    log("m2", 2026, 5, 19, "N8N Mahieu", "Loic"),
    log("m3", 2026, 5, 19, "N8N Odoo→SMC", "Quentin"),
    log("m4", 2026, 5, 22, "A", "Gary"),
    log("m5", 2026, 5, 22, "B", "Gary"),
    log("m6", 2026, 8, 31, "C", "Gary"),
  ];

  const automationsOdoo: LogEvent[] = [
    log("o1", 2026, 5, 22, "Rapport Logistique", "Dominique"),
  ];

  const maintenances: LogEvent[] = [
    log("t1", 2026, 5, 19, "Redémarrage Smartscans", "Gary"),
  ];

  const phishing: PhishingEvent[] = [
    {
      id: "p1",
      date: "2026-07-01",
      year: 2026,
      month: 7,
      week: 27,
      failures: 2,
    },
  ];

  return {
    schemaVersion: APP_SCHEMA_VERSION,
    revision: 1,
    year: 2026,
    weeks,
    automationsMetier,
    automationsOdoo,
    phishing,
    maintenances,
    ticketsByType: {},
    ticketsByAssignee: {},
    ticketsByRequester: {},
    settings: {
      ...emptyAppSettings(),
      responsibles: ["Gary", "Loic", "Quentin", "Dominique"],
    },
  };
}
