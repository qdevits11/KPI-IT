import type {
  FormulaDefinition,
  KpiValue,
  ManualEntries,
  PeriodData,
  JiraTicketStats,
} from "./types";

/** Catalogue des formules — source de vérité pour le calcul et l'explication UI */
export const FORMULAS: FormulaDefinition[] = [
  {
    id: "tickets_created",
    category: "tickets",
    name: "Tickets créés",
    description: "Nombre de tickets Jira créés pendant la période.",
    formula: "COUNT(tickets WHERE created ∈ période)",
    inputs: [
      {
        name: "tickets créés",
        source: "jira",
        description: "Issues créées via JQL sur la période",
      },
    ],
    example: "45 tickets créés en mars 2026",
  },
  {
    id: "tickets_resolved",
    category: "tickets",
    name: "Tickets résolus",
    description: "Nombre de tickets résolus (statut Done / Resolved) pendant la période.",
    formula: "COUNT(tickets WHERE resolved ∈ période)",
    inputs: [
      {
        name: "tickets résolus",
        source: "jira",
        description: "Issues résolues via JQL sur la période",
      },
    ],
    example: "52 tickets résolus en mars 2026",
  },
  {
    id: "tickets_open",
    category: "tickets",
    name: "Tickets ouverts",
    description: "Stock de tickets non résolus à la fin de la période.",
    formula: "COUNT(tickets WHERE status ∉ {Done, Resolved, Closed})",
    inputs: [
      {
        name: "tickets ouverts",
        source: "jira",
        description: "Issues encore ouvertes (snapshot)",
      },
    ],
    example: "18 tickets encore ouverts",
  },
  {
    id: "avg_resolution_hours",
    category: "tickets",
    name: "Délai moyen de résolution",
    description:
      "Moyenne des délais entre création et résolution, pour les tickets résolus dans la période.",
    formula: "Σ(heures_résolution) / tickets_résolus",
    inputs: [
      {
        name: "totalResolutionHours",
        source: "jira",
        description: "Somme des délais de résolution (heures)",
      },
      {
        name: "resolved",
        source: "jira",
        description: "Nombre de tickets résolus",
      },
    ],
    example: "120 h / 40 tickets = 3,0 h",
  },
  {
    id: "sla_compliance",
    category: "tickets",
    name: "Respect SLA",
    description:
      "Pourcentage de tickets résolus dans le délai SLA parmi ceux qui ont un SLA suivi.",
    formula: "(resolvedWithSlaMet / resolvedWithSlaTracked) × 100",
    inputs: [
      {
        name: "resolvedWithSlaMet",
        source: "jira",
        description: "Tickets résolus dans le SLA",
      },
      {
        name: "resolvedWithSlaTracked",
        source: "jira",
        description: "Tickets résolus avec SLA applicable",
      },
    ],
    example: "38 / 40 = 95 %",
  },
  {
    id: "device_compliance",
    category: "appareils",
    name: "Conformité mises à jour",
    description:
      "Part des appareils à jour par rapport au parc total déclaré.",
    formula: "(devicesUpToDate / devicesTotal) × 100",
    inputs: [
      {
        name: "devicesUpToDate",
        source: "manuel",
        description: "Appareils à jour",
      },
      {
        name: "devicesTotal",
        source: "manuel",
        description: "Parc total suivi",
      },
    ],
    example: "92 / 100 = 92 %",
  },
  {
    id: "odoo_success_rate",
    category: "odoo",
    name: "Taux de succès Odoo",
    description:
      "Part des exécutions d'automatisations Odoo réussies sur la période.",
    formula: "(successfulRuns / totalRuns) × 100",
    inputs: [
      {
        name: "successfulRuns",
        source: "manuel",
        description: "Exécutions réussies",
      },
      {
        name: "totalRuns",
        source: "manuel",
        description: "Total des exécutions",
      },
    ],
    example: "480 / 500 = 96 %",
  },
  {
    id: "odoo_active",
    category: "odoo",
    name: "Automatisations Odoo actives",
    description: "Nombre d'automatisations Odoo actives en fin de période.",
    formula: "activeAutomations",
    inputs: [
      {
        name: "activeAutomations",
        source: "manuel",
        description: "Compteur saisi",
      },
    ],
    example: "12 automatisations actives",
  },
  {
    id: "business_active",
    category: "metier",
    name: "Automatisations métier actives",
    description: "Nombre d'automatisations métier actives.",
    formula: "activeAutomations",
    inputs: [
      {
        name: "activeAutomations",
        source: "manuel",
        description: "Compteur saisi",
      },
    ],
    example: "8 automatisations métier",
  },
  {
    id: "hours_saved",
    category: "metier",
    name: "Heures économisées",
    description:
      "Estimation des heures gagnées grâce aux automatisations métier sur la période.",
    formula: "estimatedHoursSaved",
    inputs: [
      {
        name: "estimatedHoursSaved",
        source: "manuel",
        description: "Estimation saisie par l'équipe IT",
      },
    ],
    example: "40 heures estimées",
  },
  {
    id: "phishing_click_rate",
    category: "phishing",
    name: "Taux de clic phishing",
    description:
      "Part des participants ayant cliqué sur le lien de la campagne de phishing (plus bas = mieux).",
    formula: "(clicked / participants) × 100",
    inputs: [
      { name: "clicked", source: "manuel", description: "Clics enregistrés" },
      {
        name: "participants",
        source: "manuel",
        description: "Employés ciblés",
      },
    ],
    example: "8 / 120 = 6,7 %",
  },
  {
    id: "phishing_report_rate",
    category: "phishing",
    name: "Taux de signalement",
    description:
      "Part des participants ayant signalé le mail de phishing (plus haut = mieux).",
    formula: "(reported / participants) × 100",
    inputs: [
      {
        name: "reported",
        source: "manuel",
        description: "Signalements",
      },
      {
        name: "participants",
        source: "manuel",
        description: "Employés ciblés",
      },
    ],
    example: "54 / 120 = 45 %",
  },
  {
    id: "maintenance_completion",
    category: "production",
    name: "Taux de maintenance réalisée",
    description:
      "Part des interventions de maintenance planifiées effectivement réalisées.",
    formula: "(completedInterventions / plannedInterventions) × 100",
    inputs: [
      {
        name: "completedInterventions",
        source: "manuel",
        description: "Interventions réalisées",
      },
      {
        name: "plannedInterventions",
        source: "manuel",
        description: "Interventions planifiées",
      },
    ],
    example: "9 / 10 = 90 %",
  },
  {
    id: "availability",
    category: "production",
    name: "Disponibilité production",
    description:
      "Pourcentage de temps où les systèmes de production étaient disponibles.",
    formula: "((periodMinutes − downtimeMinutes) / periodMinutes) × 100",
    inputs: [
      {
        name: "downtimeMinutes",
        source: "manuel",
        description: "Minutes d'indisponibilité",
      },
      {
        name: "periodMinutes",
        source: "manuel",
        description: "Durée totale de la période en minutes",
      },
    ],
    example: "((43200 − 90) / 43200) × 100 = 99,79 %",
  },
  {
    id: "unplanned_incidents",
    category: "production",
    name: "Incidents non planifiés",
    description: "Nombre d'incidents de production non planifiés sur la période.",
    formula: "unplannedIncidents",
    inputs: [
      {
        name: "unplannedIncidents",
        source: "manuel",
        description: "Compteur saisi",
      },
    ],
    example: "2 incidents",
  },
];

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

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
  if (value <= target * 1.25) return "warning";
  return "critical";
}

function kpi(
  partial: Omit<KpiValue, "status"> & { status?: KpiValue["status"] },
): KpiValue {
  const status =
    partial.status ??
    statusFor(partial.value, partial.target, partial.higherIsBetter);
  return { ...partial, status };
}

export function computeKpis(data: PeriodData): KpiValue[] {
  const { jira, manual } = data;
  return [
    ...computeTicketKpis(jira),
    ...computeDeviceKpis(manual),
    ...computeOdooKpis(manual),
    ...computeBusinessKpis(manual),
    ...computePhishingKpis(manual),
    ...computeProductionKpis(manual),
  ];
}

function computeTicketKpis(jira: JiraTicketStats): KpiValue[] {
  const avgHours =
    jira.resolved > 0
      ? Math.round((jira.totalResolutionHours / jira.resolved) * 10) / 10
      : null;

  return [
    kpi({
      id: "tickets_created",
      category: "tickets",
      label: "Tickets créés",
      value: jira.created,
      unit: "number",
      target: null,
      higherIsBetter: false,
      source: "jira",
      formulaId: "tickets_created",
    }),
    kpi({
      id: "tickets_resolved",
      category: "tickets",
      label: "Tickets résolus",
      value: jira.resolved,
      unit: "number",
      target: null,
      higherIsBetter: true,
      source: "jira",
      formulaId: "tickets_resolved",
    }),
    kpi({
      id: "tickets_open",
      category: "tickets",
      label: "Tickets ouverts",
      value: jira.open,
      unit: "number",
      target: 25,
      higherIsBetter: false,
      source: "jira",
      formulaId: "tickets_open",
    }),
    kpi({
      id: "avg_resolution_hours",
      category: "tickets",
      label: "Délai moyen résolution",
      value: avgHours,
      unit: "hours",
      target: 8,
      higherIsBetter: false,
      source: "jira",
      formulaId: "avg_resolution_hours",
    }),
    kpi({
      id: "sla_compliance",
      category: "tickets",
      label: "Respect SLA",
      value: pct(jira.resolvedWithSlaMet, jira.resolvedWithSlaTracked),
      unit: "percent",
      target: 95,
      higherIsBetter: true,
      source: "jira",
      formulaId: "sla_compliance",
    }),
  ];
}

function computeDeviceKpis(manual: ManualEntries): KpiValue[] {
  const d = manual.deviceUpdates;
  return [
    kpi({
      id: "device_compliance",
      category: "appareils",
      label: "Conformité appareils",
      value: pct(d.devicesUpToDate, d.devicesTotal),
      unit: "percent",
      target: 95,
      higherIsBetter: true,
      source: "manuel",
      formulaId: "device_compliance",
    }),
  ];
}

function computeOdooKpis(manual: ManualEntries): KpiValue[] {
  const o = manual.odooAutomations;
  return [
    kpi({
      id: "odoo_active",
      category: "odoo",
      label: "Automations Odoo",
      value: o.activeAutomations,
      unit: "number",
      target: null,
      higherIsBetter: true,
      source: "manuel",
      formulaId: "odoo_active",
    }),
    kpi({
      id: "odoo_success_rate",
      category: "odoo",
      label: "Succès Odoo",
      value: pct(o.successfulRuns, o.totalRuns),
      unit: "percent",
      target: 98,
      higherIsBetter: true,
      source: "manuel",
      formulaId: "odoo_success_rate",
    }),
  ];
}

function computeBusinessKpis(manual: ManualEntries): KpiValue[] {
  const b = manual.businessAutomations;
  return [
    kpi({
      id: "business_active",
      category: "metier",
      label: "Automations métier",
      value: b.activeAutomations,
      unit: "number",
      target: null,
      higherIsBetter: true,
      source: "manuel",
      formulaId: "business_active",
    }),
    kpi({
      id: "hours_saved",
      category: "metier",
      label: "Heures économisées",
      value: b.estimatedHoursSaved,
      unit: "hours",
      target: null,
      higherIsBetter: true,
      source: "manuel",
      formulaId: "hours_saved",
    }),
  ];
}

function computePhishingKpis(manual: ManualEntries): KpiValue[] {
  const p = manual.phishingTests;
  return [
    kpi({
      id: "phishing_click_rate",
      category: "phishing",
      label: "Taux de clic phishing",
      value: pct(p.clicked, p.participants),
      unit: "percent",
      target: 10,
      higherIsBetter: false,
      source: "manuel",
      formulaId: "phishing_click_rate",
    }),
    kpi({
      id: "phishing_report_rate",
      category: "phishing",
      label: "Taux de signalement",
      value: pct(p.reported, p.participants),
      unit: "percent",
      target: 40,
      higherIsBetter: true,
      source: "manuel",
      formulaId: "phishing_report_rate",
    }),
  ];
}

function computeProductionKpis(manual: ManualEntries): KpiValue[] {
  const m = manual.productionMaintenance;
  return [
    kpi({
      id: "maintenance_completion",
      category: "production",
      label: "Maintenance réalisée",
      value: pct(m.completedInterventions, m.plannedInterventions),
      unit: "percent",
      target: 100,
      higherIsBetter: true,
      source: "manuel",
      formulaId: "maintenance_completion",
    }),
    kpi({
      id: "availability",
      category: "production",
      label: "Disponibilité",
      value: pct(m.periodMinutes - m.downtimeMinutes, m.periodMinutes),
      unit: "percent",
      target: 99.5,
      higherIsBetter: true,
      source: "manuel",
      formulaId: "availability",
    }),
    kpi({
      id: "unplanned_incidents",
      category: "production",
      label: "Incidents non planifiés",
      value: m.unplannedIncidents,
      unit: "number",
      target: 3,
      higherIsBetter: false,
      source: "manuel",
      formulaId: "unplanned_incidents",
    }),
  ];
}

export function getFormula(id: string): FormulaDefinition | undefined {
  return FORMULAS.find((f) => f.id === id);
}

export const CATEGORY_LABELS: Record<string, string> = {
  tickets: "Tickets Jira",
  appareils: "Mises à jour appareils",
  odoo: "Automatisations Odoo",
  metier: "Automatisations métier",
  phishing: "Tests de phishing",
  production: "Maintenance production",
};
