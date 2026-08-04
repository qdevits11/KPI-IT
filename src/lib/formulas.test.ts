import { describe, expect, it } from "vitest";
import { computeKpis, FORMULAS } from "./formulas";
import type { PeriodData } from "./types";
import { createEmptyJira, createEmptyManual } from "./seed";

function samplePeriod(): PeriodData {
  return {
    period: { id: "2026-03", label: "Mars 2026", year: 2026, month: 3 },
    jira: {
      ...createEmptyJira(),
      created: 40,
      resolved: 36,
      open: 12,
      totalResolutionHours: 108,
      resolvedWithSlaMet: 33,
      resolvedWithSlaTracked: 36,
    },
    manual: {
      ...createEmptyManual(31),
      deviceUpdates: {
        devicesTotal: 100,
        devicesUpToDate: 92,
        campaignName: "Patch",
        notes: "",
      },
      odooAutomations: {
        activeAutomations: 10,
        newThisPeriod: 1,
        successfulRuns: 490,
        totalRuns: 500,
        notes: "",
      },
      businessAutomations: {
        activeAutomations: 7,
        newThisPeriod: 0,
        estimatedHoursSaved: 28,
        notes: "",
      },
      phishingTests: {
        participants: 100,
        clicked: 8,
        reported: 45,
        campaignName: "Q1",
        notes: "",
      },
      productionMaintenance: {
        plannedInterventions: 10,
        completedInterventions: 9,
        unplannedIncidents: 2,
        downtimeMinutes: 60,
        periodMinutes: 43200,
        notes: "",
      },
      updatedAt: null,
      updatedBy: null,
    },
  };
}

describe("computeKpis", () => {
  it("calcule les KPI tickets à partir de Jira", () => {
    const kpis = computeKpis(samplePeriod());
    const avg = kpis.find((k) => k.id === "avg_resolution_hours");
    const sla = kpis.find((k) => k.id === "sla_compliance");
    expect(avg?.value).toBe(3);
    expect(sla?.value).toBe(91.7);
  });

  it("calcule conformité appareils et phishing", () => {
    const kpis = computeKpis(samplePeriod());
    expect(kpis.find((k) => k.id === "device_compliance")?.value).toBe(92);
    expect(kpis.find((k) => k.id === "phishing_click_rate")?.value).toBe(8);
    expect(kpis.find((k) => k.id === "phishing_report_rate")?.value).toBe(45);
  });

  it("calcule disponibilité production", () => {
    const kpis = computeKpis(samplePeriod());
    const avail = kpis.find((k) => k.id === "availability");
    expect(avail?.value).toBe(99.9);
  });

  it("chaque KPI a une formule documentée", () => {
    const kpis = computeKpis(samplePeriod());
    for (const kpi of kpis) {
      expect(FORMULAS.some((f) => f.id === kpi.formulaId)).toBe(true);
    }
  });

  it("retourne null si dénominateur nul", () => {
    const data = samplePeriod();
    data.manual.deviceUpdates.devicesTotal = 0;
    data.manual.deviceUpdates.devicesUpToDate = 0;
    const kpis = computeKpis(data);
    expect(kpis.find((k) => k.id === "device_compliance")?.value).toBeNull();
    expect(kpis.find((k) => k.id === "device_compliance")?.status).toBe("na");
  });
});
