import { describe, expect, it } from "vitest";
import { generateWeekAnalysis } from "./week-analysis";
import { createFormulaTestDatabase } from "./test-fixture";
import type { AppDatabase } from "./types";

function withTicketData(db: AppDatabase): AppDatabase {
  return {
    ...db,
    ticketsByType: {
      "2026-S29": { VPN: 2, Imprimante: 4 },
      "2026-S30": { VPN: 2, Imprimante: 3 },
      "2026-S31": { VPN: 12, Imprimante: 3 },
    },
    ticketsByAssignee: {
      "2026-S31": { Paul: 10, Marie: 4, Loic: 3 },
    },
    openByAssignee: {
      "2026-S30": { Paul: 6, Marie: 5, Loic: 5 },
      "2026-S31": { Paul: 18, Marie: 5, Loic: 4 },
    },
    weeks: db.weeks.map((w) => {
      if (w.week === 30) {
        return {
          ...w,
          demandesItHebdo: 30,
          demandesClotureesHebdo: 28,
          demandesNonResoluesHebdo: 45,
          ticketsHorsSlaCloture: 2,
          ticketsHorsSlaPriseEnCharge: 1,
        };
      }
      if (w.week === 31) {
        return {
          ...w,
          demandesItHebdo: 55,
          demandesClotureesHebdo: 28,
          demandesNonResoluesHebdo: 70,
          ticketsHorsSlaCloture: 8,
          ticketsHorsSlaPriseEnCharge: 5,
          informations: "",
          reaction: "",
        };
      }
      return w;
    }),
  };
}

describe("generateWeekAnalysis", () => {
  it("signale les hausses KPI, pic de type et surcharge en phrases concises", () => {
    const db = withTicketData(createFormulaTestDatabase());
    const result = generateWeekAnalysis(db, "2026-S31");

    expect(result.weekId).toBe("2026-S31");
    // Phrase unique, sans puces — couvre les kinds prioritaires
    expect(result.fluctuation).toMatch(/^S31 :/);
    expect(result.fluctuation).toContain("VPN");
    expect(result.fluctuation).toContain("Paul");
    expect(result.fluctuation).not.toContain("•");
    expect(result.fluctuation).not.toContain("\n");
    expect(result.recommandations).not.toContain("•");
    expect(result.recommandations).not.toContain("\n");
    expect(result.recommandations.length).toBeGreaterThan(0);
    expect(result.recommandations.endsWith(".")).toBe(true);
    expect(result.signals.some((s) => s.kind === "type_spike")).toBe(true);
    expect(result.signals.some((s) => s.kind === "load")).toBe(true);
  });

  it("signale l’écart création / clôture quand le stock se nourrit", () => {
    const db = createFormulaTestDatabase();
    // Fixture : ~35 créés vs ~22 clôturés chaque semaine
    const result = generateWeekAnalysis(db, "2026-S20");
    expect(result.fluctuation).toMatch(/création|clôture|Demandes|stable/i);
    expect(result.recommandations.length).toBeGreaterThan(0);
  });

  it("annonce une semaine stable si les flux sont équilibrés", () => {
    const db = createFormulaTestDatabase();
    db.weeks = db.weeks.map((w) =>
      w.week >= 18 && w.week <= 20
        ? {
            ...w,
            demandesItHebdo: 30,
            demandesClotureesHebdo: 30,
            demandesNonResoluesHebdo: 40,
            ticketsHorsSlaCloture: 1,
            ticketsHorsSlaPriseEnCharge: 1,
          }
        : w,
    );
    const result = generateWeekAnalysis(db, "2026-S20");
    expect(result.fluctuation.toLowerCase()).toMatch(/stable|pas d’écart/);
  });

  it("gère une semaine absente", () => {
    const db = createFormulaTestDatabase();
    const result = generateWeekAnalysis(db, "2026-S52");
    expect(result.signals[0]?.kind).toBe("data");
    expect(result.fluctuation).toMatch(/synchronisation|Aucune donnée/i);
  });
});
