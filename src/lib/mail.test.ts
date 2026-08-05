import { describe, expect, it } from "vitest";
import { buildWeekMailText, buildWeekMailHtml } from "./mail";

const sample = {
  year: 2026,
  week: 31,
  start: "2026-07-27",
  endExclusive: "2026-08-03",
  demandesItHebdo: 42,
  demandesNonResoluesHebdo: 17,
  ticketsHorsSlaCloture: 3,
  ticketsHorsSlaPriseEnCharge: 1,
};

describe("buildWeekMailText", () => {
  it("inclut les 4 KPI", () => {
    const text = buildWeekMailText(sample);
    expect(text).toContain("2026-S31");
    expect(text).toContain("Tickets créés : 42");
    expect(text).toContain("Non résolus : 17");
    expect(text).toContain("Hors SLA clôture : 3");
    expect(text).toContain("Hors SLA prise en charge : 1");
  });
});

describe("buildWeekMailHtml", () => {
  it("génère un HTML avec les valeurs", () => {
    const html = buildWeekMailHtml(sample);
    expect(html).toContain("Rapport semaine 2026-S31");
    expect(html).toContain(">42<");
    expect(html).toContain(">17<");
  });
});
