import { describe, expect, it } from "vitest";
import { computeWeekKpis, ytdSum, FORMULAS } from "./formulas";
import { createFormulaTestDatabase } from "./test-fixture";
import { weekId } from "./types";

describe("formules KPI", () => {
  const db = createFormulaTestDatabase();

  it("charge le jeu de test (31 semaines)", () => {
    expect(db.weeks.length).toBe(31);
    expect(db.automationsMetier.length).toBe(6);
    expect(db.automationsOdoo.length).toBe(1);
    expect(db.maintenances.length).toBe(1);
  });

  it("COUNT automations métiers semaine 19 = 3", () => {
    const week = db.weeks.find((w) => w.week === 19)!;
    const kpis = computeWeekKpis(db, week);
    expect(kpis.find((k) => k.id === "automations_metier")?.value).toBe(3);
    expect(kpis.find((k) => k.id === "maintenances_production")?.value).toBe(1);
  });

  it("COUNT Odoo semaine 22 = 1", () => {
    const week = db.weeks.find((w) => w.week === 22)!;
    const kpis = computeWeekKpis(db, week);
    expect(kpis.find((k) => k.id === "ameliorations_odoo")?.value).toBe(1);
    expect(kpis.find((k) => k.id === "automations_metier")?.value).toBe(2);
  });

  it("YTD Demandes IT semaine 31 = 1090", () => {
    const ytd = ytdSum(db.weeks, 2026, 31, "demandesItHebdo");
    expect(ytd).toBe(1090);
  });

  it("YTD Non résolues semaine 31 = 1617", () => {
    const ytd = ytdSum(db.weeks, 2026, 31, "demandesNonResoluesHebdo");
    expect(ytd).toBe(1617);
  });

  it("SUM phishing semaine 31 = 0", () => {
    const week = db.weeks.find((w) => w.week === 31)!;
    const kpis = computeWeekKpis(db, week);
    expect(kpis.find((k) => k.id === "echecs_phishing")?.value).toBe(0);
    expect(kpis.find((k) => k.id === "demandes_it_hebdo")?.value).toBe(40);
    expect(kpis.find((k) => k.id === "demandes_it_ytd")?.value).toBe(1090);
  });

  it("chaque KPI a une formule documentée", () => {
    const week = db.weeks.find((w) => w.week === 31)!;
    for (const kpi of computeWeekKpis(db, week)) {
      expect(FORMULAS.some((f) => f.id === kpi.formulaId)).toBe(true);
    }
  });

  it("weekId format", () => {
    expect(weekId({ year: 2026, month: 7, week: 31 })).toBe("2026-S31");
  });
});
