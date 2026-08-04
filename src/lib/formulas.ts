import type {
  AppDatabase,
  FormulaDefinition,
  KpiValue,
  LogEvent,
  PhishingEvent,
  WeekDashboard,
  WeeklyRow,
} from "./types";
import { weekId } from "./types";

/**
 * Formules calquées sur KPI.xlsx (feuille 2026 + feuilles de détail).
 *
 * YTD Demandes IT : L_n = K_n + L_(n-1)  (cumul des hebdo)
 * YTD Non résolues : N_n = M_n + N_(n-1)  (cumul des stocks hebdo — comme Excel)
 * Automations métiers : COUNTIFS(année, semaine) sur feuille « Automatisations métiers »
 * Améliorations Odoo : COUNTIFS(année, semaine) sur « Automatisations Odoo »
 * Échecs phishing : SUMIFS(Nbr échecs) sur « Tests Phishing »
 * Maintenances : COUNTIFS(année, semaine) sur « Maintenances Production »
 */
export const FORMULAS: FormulaDefinition[] = [
  {
    id: "hors_sla_cloture",
    category: "sla",
    name: "Tickets hors SLA clôture",
    description:
      "Tickets résolus hors délai SLA sur la semaine (User experience / IT Team).",
    formula:
      'JQL: resolved ∈ semaine AND "Time to resolution" = breached() — ou saisie manuelle',
    inputs: [
      {
        name: "ticketsHorsSlaCloture",
        source: "jira",
        description: "Sync Jira (SLA JSM) ou colonne E feuille année",
      },
    ],
    example: "Semaine 31 : 7 tickets hors SLA clôture",
    excelSheet: "2026",
  },
  {
    id: "hors_sla_prise_en_charge",
    category: "sla",
    name: "Tickets hors SLA prise en charge",
    description:
      "Tickets créés dans la semaine dont la prise en charge a dépassé le SLA.",
    formula:
      'JQL: created ∈ semaine AND "Time to first response" = breached() — ou saisie manuelle',
    inputs: [
      {
        name: "ticketsHorsSlaPriseEnCharge",
        source: "jira",
        description: "Sync Jira (SLA JSM) ou colonne F feuille année",
      },
    ],
    example: "Semaine 31 : 1 ticket hors SLA prise en charge",
    excelSheet: "2026",
  },
  {
    id: "automations_metier",
    category: "metier",
    name: "Automatisations métiers",
    description:
      "Nombre d'automatisations métiers livrées cette semaine (lignes du journal).",
    formula:
      "COUNTIFS(Automatisations métiers!Année, année, Automatisations métiers!Semaine, semaine)",
    inputs: [
      {
        name: "lignes journal",
        source: "manuel",
        description: "Chaque ligne = 1 automatisation (explication + responsable)",
      },
    ],
    example: "Semaine 19 : 3 (FLUX B2C, N8N Mahieu, N8N Odoo→SMC)",
    excelSheet: "Automatisations métiers",
  },
  {
    id: "ameliorations_odoo",
    category: "odoo",
    name: "Améliorations dans Odoo",
    description: "Nombre d'améliorations / automatisations Odoo livrées cette semaine.",
    formula:
      "COUNTIFS(Automatisations Odoo!Année, année, Automatisations Odoo!Semaine, semaine)",
    inputs: [
      {
        name: "lignes journal",
        source: "manuel",
        description: "Feuille Automatisations Odoo",
      },
    ],
    example: "Semaine 22 : 1 (Rapport Logistique)",
    excelSheet: "Automatisations Odoo",
  },
  {
    id: "echecs_phishing",
    category: "phishing",
    name: "Échecs tests phishing",
    description: "Somme des échecs (Nbr échecs) des tests de phishing de la semaine.",
    formula:
      "SUMIFS(Tests Phishing!Nbr échecs, Année, année, Semaine, semaine)",
    inputs: [
      {
        name: "Nbr échecs",
        source: "manuel",
        description: "Colonne F feuille Tests Phishing",
      },
    ],
    example: "Semaine 31 : 0 échec",
    excelSheet: "Tests Phishing",
  },
  {
    id: "maintenances_production",
    category: "production",
    name: "Maintenances production",
    description: "Nombre d'interventions de maintenance production sur la semaine.",
    formula:
      "COUNTIFS(Maintenances Production!Année, année, Maintenances Production!Semaine, semaine)",
    inputs: [
      {
        name: "lignes journal",
        source: "manuel",
        description: "Feuille Maintenances Production",
      },
    ],
    example: "Semaine 19 : 1 (Redémarrage Smartscans)",
    excelSheet: "Maintenances Production",
  },
  {
    id: "demandes_it_hebdo",
    category: "ticketing",
    name: "Demandes IT (hebdo)",
    description: "Nombre de demandes / tickets IT sur la semaine.",
    formula: "COUNT(tickets créés semaine) — saisie ou Jira",
    inputs: [
      {
        name: "demandesItHebdo",
        source: "jira",
        description: "Colonne K feuille année / sync Jira",
      },
    ],
    example: "Semaine 31 : 15",
    excelSheet: "2026",
  },
  {
    id: "demandes_it_ytd",
    category: "ticketing",
    name: "Demandes IT (YTD)",
    description:
      "Cumul année des demandes IT hebdomadaires (comme Excel : L_n = K_n + L_(n-1)).",
    formula: "Σ demandesItHebdo depuis semaine 1 jusqu'à la semaine courante",
    inputs: [
      {
        name: "demandesItHebdo (toutes semaines ≤ n)",
        source: "calcule",
        description: "Somme des colonnes Hebdo Demandes IT",
      },
    ],
    example: "Semaine 31 : 1090",
    excelSheet: "2026",
  },
  {
    id: "demandes_non_resolues_hebdo",
    category: "ticketing",
    name: "Demandes non résolues (hebdo)",
    description: "Stock de demandes non résolues en fin de semaine.",
    formula: "valeur saisie / snapshot Jira open",
    inputs: [
      {
        name: "demandesNonResoluesHebdo",
        source: "jira",
        description: "Colonne M feuille année",
      },
    ],
    example: "Semaine 31 : 48",
    excelSheet: "2026",
  },
  {
    id: "demandes_non_resolues_ytd",
    category: "ticketing",
    name: "Demandes non résolues (YTD)",
    description:
      "Cumul Excel des stocks hebdo : N_n = M_n + N_(n-1). Conservé pour parité avec le fichier.",
    formula: "Σ demandesNonResoluesHebdo depuis semaine 1 jusqu'à n",
    inputs: [
      {
        name: "demandesNonResoluesHebdo (≤ n)",
        source: "calcule",
        description: "Somme cumulative comme dans KPI.xlsx",
      },
    ],
    example: "Semaine 31 : 1617",
    excelSheet: "2026",
  },
];

export const CATEGORY_LABELS: Record<string, string> = {
  sla: "User experience — SLA",
  metier: "Logiciels et Données — Automations métiers",
  odoo: "Logiciels et Données — Odoo",
  phishing: "Infrastructure & Sécurité — Phishing",
  production: "Infrastructure & Sécurité — Production",
  ticketing: "Ticketing",
};

function statusFor(
  value: number | null,
  target: number | null,
  higherIsBetter: boolean,
): KpiValue["status"] {
  if (value === null) return "na";
  if (target === null) return "ok";
  if (higherIsBetter) {
    if (value >= target) return "ok";
    if (value >= target * 0.9) return "warning";
    return "critical";
  }
  if (value <= target) return "ok";
  if (value <= target * 1.5) return "warning";
  return "critical";
}

function kpi(partial: Omit<KpiValue, "status">): KpiValue {
  return {
    ...partial,
    status: statusFor(partial.value, partial.target, partial.higherIsBetter),
  };
}

function countForWeek(events: LogEvent[], year: number, week: number): number {
  return events.filter((e) => e.year === year && e.week === week).length;
}

function sumPhishingFailures(
  events: PhishingEvent[],
  year: number,
  week: number,
): number {
  return events
    .filter((e) => e.year === year && e.week === week)
    .reduce((s, e) => s + (e.failures || 0), 0);
}

/** YTD = somme des valeurs hebdo de la semaine 1 à n (parité Excel) */
export function ytdSum(
  weeks: WeeklyRow[],
  year: number,
  upToWeek: number,
  field: "demandesItHebdo" | "demandesNonResoluesHebdo",
): number {
  return weeks
    .filter((w) => w.year === year && w.week <= upToWeek)
    .sort((a, b) => a.week - b.week)
    .reduce((sum, w) => sum + (w[field] ?? 0), 0);
}

export function computeWeekKpis(
  db: AppDatabase,
  week: WeeklyRow,
): KpiValue[] {
  const { year } = week;
  const w = week.week;

  const automations = countForWeek(db.automationsMetier, year, w);
  const odoo = countForWeek(db.automationsOdoo, year, w);
  const phishing = sumPhishingFailures(db.phishing, year, w);
  const maint = countForWeek(db.maintenances, year, w);
  const ytdIt = ytdSum(db.weeks, year, w, "demandesItHebdo");
  const ytdOpen = ytdSum(db.weeks, year, w, "demandesNonResoluesHebdo");

  return [
    kpi({
      id: "hors_sla_cloture",
      category: "sla",
      label: "Hors SLA clôture",
      value: week.ticketsHorsSlaCloture,
      unit: "number",
      target: 10,
      higherIsBetter: false,
      source: "jira",
      formulaId: "hors_sla_cloture",
    }),
    kpi({
      id: "hors_sla_prise_en_charge",
      category: "sla",
      label: "Hors SLA prise en charge",
      value: week.ticketsHorsSlaPriseEnCharge,
      unit: "number",
      target: 10,
      higherIsBetter: false,
      source: "jira",
      formulaId: "hors_sla_prise_en_charge",
    }),
    kpi({
      id: "automations_metier",
      category: "metier",
      label: "Automatisations métiers",
      value: automations,
      unit: "number",
      target: null,
      higherIsBetter: true,
      source: "calcule",
      formulaId: "automations_metier",
    }),
    kpi({
      id: "ameliorations_odoo",
      category: "odoo",
      label: "Améliorations Odoo",
      value: odoo,
      unit: "number",
      target: null,
      higherIsBetter: true,
      source: "calcule",
      formulaId: "ameliorations_odoo",
    }),
    kpi({
      id: "echecs_phishing",
      category: "phishing",
      label: "Échecs phishing",
      value: phishing,
      unit: "number",
      target: 0,
      higherIsBetter: false,
      source: "calcule",
      formulaId: "echecs_phishing",
    }),
    kpi({
      id: "maintenances_production",
      category: "production",
      label: "Maintenances production",
      value: maint,
      unit: "number",
      target: null,
      higherIsBetter: true,
      source: "calcule",
      formulaId: "maintenances_production",
    }),
    kpi({
      id: "demandes_it_hebdo",
      category: "ticketing",
      label: "Demandes IT (hebdo)",
      value: week.demandesItHebdo,
      unit: "number",
      target: null,
      higherIsBetter: false,
      source: "jira",
      formulaId: "demandes_it_hebdo",
    }),
    kpi({
      id: "demandes_it_ytd",
      category: "ticketing",
      label: "Demandes IT (YTD)",
      value: ytdIt,
      unit: "number",
      target: null,
      higherIsBetter: false,
      source: "calcule",
      formulaId: "demandes_it_ytd",
    }),
    kpi({
      id: "demandes_non_resolues_hebdo",
      category: "ticketing",
      label: "Non résolues (hebdo)",
      value: week.demandesNonResoluesHebdo,
      unit: "number",
      target: 50,
      higherIsBetter: false,
      source: "jira",
      formulaId: "demandes_non_resolues_hebdo",
    }),
    kpi({
      id: "demandes_non_resolues_ytd",
      category: "ticketing",
      label: "Non résolues (YTD)",
      value: ytdOpen,
      unit: "number",
      target: null,
      higherIsBetter: false,
      source: "calcule",
      formulaId: "demandes_non_resolues_ytd",
    }),
  ];
}

export function buildWeekDashboard(
  db: AppDatabase,
  week: WeeklyRow,
): WeekDashboard {
  const id = weekId(week);
  return {
    week,
    kpis: computeWeekKpis(db, week),
    events: {
      automationsMetier: db.automationsMetier.filter(
        (e) => e.year === week.year && e.week === week.week,
      ),
      automationsOdoo: db.automationsOdoo.filter(
        (e) => e.year === week.year && e.week === week.week,
      ),
      phishing: db.phishing.filter(
        (e) => e.year === week.year && e.week === week.week,
      ),
      maintenances: db.maintenances.filter(
        (e) => e.year === week.year && e.week === week.week,
      ),
    },
    ticketsByType: db.ticketsByType[id] ?? {},
    ticketsByAssignee: db.ticketsByAssignee[id] ?? {},
  };
}

export function getFormula(id: string): FormulaDefinition | undefined {
  return FORMULAS.find((f) => f.id === id);
}
