import type {
  AppDatabase,
  JiraTicketStats,
  ManualEntries,
  PeriodData,
} from "./types";

function periodMinutesFor(year: number, month: number): number {
  return new Date(year, month, 0).getDate() * 24 * 60;
}

export function createEmptyJira(): JiraTicketStats {
  return {
    created: 0,
    resolved: 0,
    open: 0,
    totalResolutionHours: 0,
    resolvedWithSlaMet: 0,
    resolvedWithSlaTracked: 0,
    byPriority: { highest: 0, high: 0, medium: 0, low: 0, lowest: 0 },
    lastSyncedAt: null,
  };
}

export function createEmptyManual(days = 30): ManualEntries {
  return {
    deviceUpdates: {
      devicesTotal: 0,
      devicesUpToDate: 0,
      campaignName: "",
      notes: "",
    },
    odooAutomations: {
      activeAutomations: 0,
      newThisPeriod: 0,
      successfulRuns: 0,
      totalRuns: 0,
      notes: "",
    },
    businessAutomations: {
      activeAutomations: 0,
      newThisPeriod: 0,
      estimatedHoursSaved: 0,
      notes: "",
    },
    phishingTests: {
      participants: 0,
      clicked: 0,
      reported: 0,
      campaignName: "",
      notes: "",
    },
    productionMaintenance: {
      plannedInterventions: 0,
      completedInterventions: 0,
      unplannedIncidents: 0,
      downtimeMinutes: 0,
      periodMinutes: days * 24 * 60,
      notes: "",
    },
    updatedAt: null,
    updatedBy: null,
  };
}

function makePeriod(
  year: number,
  month: number,
  jira: Partial<JiraTicketStats>,
  manualPartial: Partial<{
    deviceUpdates: Partial<ManualEntries["deviceUpdates"]>;
    odooAutomations: Partial<ManualEntries["odooAutomations"]>;
    businessAutomations: Partial<ManualEntries["businessAutomations"]>;
    phishingTests: Partial<ManualEntries["phishingTests"]>;
    productionMaintenance: Partial<ManualEntries["productionMaintenance"]>;
  }>,
): PeriodData {
  const id = `${year}-${String(month).padStart(2, "0")}`;
  const label = new Date(year, month - 1, 1).toLocaleDateString("fr-BE", {
    month: "long",
    year: "numeric",
  });
  const baseManual = createEmptyManual(
    new Date(year, month, 0).getDate(),
  );

  return {
    period: {
      id,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      year,
      month,
    },
    jira: {
      ...createEmptyJira(),
      ...jira,
      byPriority: {
        ...createEmptyJira().byPriority,
        ...(jira.byPriority ?? {}),
      },
      lastSyncedAt: jira.lastSyncedAt ?? new Date().toISOString(),
    },
    manual: {
      deviceUpdates: {
        ...baseManual.deviceUpdates,
        ...manualPartial.deviceUpdates,
      },
      odooAutomations: {
        ...baseManual.odooAutomations,
        ...manualPartial.odooAutomations,
      },
      businessAutomations: {
        ...baseManual.businessAutomations,
        ...manualPartial.businessAutomations,
      },
      phishingTests: {
        ...baseManual.phishingTests,
        ...manualPartial.phishingTests,
      },
      productionMaintenance: {
        ...baseManual.productionMaintenance,
        periodMinutes: periodMinutesFor(year, month),
        ...manualPartial.productionMaintenance,
      },
      updatedAt: new Date().toISOString(),
      updatedBy: "seed",
    },
  };
}

export function seedDatabase(): AppDatabase {
  const now = new Date();
  // Seed with demo data for recent months so the dashboard is usable immediately
  const periods: PeriodData[] = [];

  for (let offset = 2; offset >= 0; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const factor = 1 + (2 - offset) * 0.05;

    periods.push(
      makePeriod(
        y,
        m,
        {
          created: Math.round(38 * factor),
          resolved: Math.round(42 * factor),
          open: Math.round(16 / factor),
          totalResolutionHours: Math.round(95 * factor),
          resolvedWithSlaMet: Math.round(38 * factor),
          resolvedWithSlaTracked: Math.round(40 * factor),
          byPriority: {
            highest: 2,
            high: 8,
            medium: Math.round(20 * factor),
            low: 6,
            lowest: 2,
          },
        },
        {
          deviceUpdates: {
            devicesTotal: 120,
            devicesUpToDate: Math.round(108 + offset * 2),
            campaignName: `Patch ${y}-${String(m).padStart(2, "0")}`,
            notes: "Campagne Windows / macOS",
          },
          odooAutomations: {
            activeAutomations: 10 + offset,
            newThisPeriod: offset === 0 ? 1 : 0,
            successfulRuns: Math.round(480 * factor),
            totalRuns: Math.round(500 * factor),
            notes: "Workflows facturation & stock",
          },
          businessAutomations: {
            activeAutomations: 6 + offset,
            newThisPeriod: offset === 1 ? 1 : 0,
            estimatedHoursSaved: Math.round(32 * factor),
            notes: "Scripts reporting & onboarding",
          },
          phishingTests: {
            participants: 115,
            clicked: Math.max(4, 12 - offset * 3),
            reported: Math.round(40 + offset * 8),
            campaignName: `Phishing Q${Math.ceil(m / 3)}`,
            notes: "",
          },
          productionMaintenance: {
            plannedInterventions: 8,
            completedInterventions: offset === 0 ? 7 : 8,
            unplannedIncidents: offset === 1 ? 3 : 1,
            downtimeMinutes: offset === 1 ? 180 : 45,
          },
        },
      ),
    );
  }

  return {
    periods,
    settings: {
      jiraConfigured: false,
      companyName: "Coverseal",
    },
  };
}
