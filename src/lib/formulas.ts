import type {
  AppDatabase,
  FormulaDefinition,
  KpiValue,
  LogEvent,
  PhishingEvent,
  WeekDashboard,
  WeeklyRow,
  YearOverviewRow,
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
      "Tickets résolus dans la semaine dont le délai créé→résolu dépasse 48 h ouvrées (week-ends + jours fériés BE exclus). Identique au nœud n8n « Hors SLA 48h ».",
    formula:
      'JQL: resolutiondate ∈ semaine ; puis COUNT si getBusinessHours(created, resolutiondate) > 48',
    inputs: [
      {
        name: "resolutiondate + created",
        source: "jira",
        description: "project = CSD ; calcul heures ouvrées côté app",
      },
    ],
    example: "Semaine 31 : N tickets > 48h ouvrées",
    excelSheet: "2026",
  },
  {
    id: "hors_sla_prise_en_charge",
    category: "sla",
    name: "Tickets hors SLA prise en charge",
    description:
      "Tickets dont la Date Prise en Charge tombe dans la semaine et créé→prise en charge > 24 h ouvrées. Identique au nœud n8n « Hors SLA 24h » (customfield_10284).",
    formula:
      'JQL: "Date Prise en Charge" ∈ semaine ; puis COUNT si getBusinessHours(created, datePEC) > 24',
    inputs: [
      {
        name: "customfield_10284 (Date Prise en Charge)",
        source: "jira",
        description: "Champ custom Jira Coverseal",
      },
    ],
    example: "Semaine 31 : N tickets > 24h ouvrées",
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
        description: "Encodage : date + explication + responsable (1 ligne = 1 automatisation)",
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
        description: "Encodage : date + explication + responsable",
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
        description: "Encodage : date + nombre d'échecs uniquement",
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
        description: "Encodage : date + explication + responsable",
      },
    ],
    example: "Semaine 19 : 1 (Redémarrage Smartscans)",
    excelSheet: "Maintenances Production",
  },
  {
    id: "demandes_it_hebdo",
    category: "ticketing",
    name: "Demandes IT (hebdo)",
    description:
      "Tickets créés dans la semaine (n8n: created >= startOfWeek(-1) AND created < startOfWeek(), project = CSD).",
    formula:
      "JQL: project = CSD AND created >= startOfWeek(-1) AND created < startOfWeek()",
    inputs: [
      {
        name: "demandesItHebdo",
        source: "jira",
        description: "COUNT issues créées dans l'intervalle",
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
    description:
      "Snapshot des tickets encore ouverts. Semaine en cours = live à la sync. Semaines passées = figé dimanche 23:59 Europe/Brussels (cron), sinon valeur Excel/manuelle conservée.",
    formula:
      "JQL: project = CSD AND status NOT IN (Partenaire, Canceled, Done)",
    inputs: [
      {
        name: "demandesNonResoluesHebdo",
        source: "jira",
        description: "COUNT issues ouvertes (snapshot)",
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

/** Vue annuelle type feuille Excel « 2026 » — une ligne par semaine. */
export function buildYearOverview(
  db: AppDatabase,
  year: number,
): YearOverviewRow[] {
  return db.weeks
    .filter((w) => w.year === year)
    .sort((a, b) => a.week - b.week)
    .map((w) => {
      const kpis = computeWeekKpis(db, w);
      const val = (id: string) =>
        kpis.find((k) => k.id === id)?.value ?? null;
      return {
        year: w.year,
        month: w.month,
        week: w.week,
        weekKey: weekId(w),
        horsSlaCloture: val("hors_sla_cloture"),
        horsSlaPriseEnCharge: val("hors_sla_prise_en_charge"),
        automationsMetier: val("automations_metier") ?? 0,
        ameliorationsOdoo: val("ameliorations_odoo") ?? 0,
        echecsPhishing: val("echecs_phishing") ?? 0,
        maintenances: val("maintenances_production") ?? 0,
        demandesItHebdo: val("demandes_it_hebdo"),
        demandesItYtd: val("demandes_it_ytd") ?? 0,
        nonResoluesHebdo: val("demandes_non_resolues_hebdo"),
        nonResoluesYtd: val("demandes_non_resolues_ytd") ?? 0,
        fluctuation: w.informations ?? "",
        recommandations: w.reaction ?? "",
      };
    });
}

export function getFormula(id: string): FormulaDefinition | undefined {
  return FORMULAS.find((f) => f.id === id);
}
