import { describe, expect, it } from "vitest";
import { pickSavePatch, describeSaveFields } from "./save-fields";

describe("pickSavePatch", () => {
  const full = {
    demandesItHebdo: 15,
    demandesNonResoluesHebdo: 48,
    ticketsHorsSlaCloture: 7,
    ticketsHorsSlaPriseEnCharge: 1,
    jiraSyncedAt: "2026-08-05T10:00:00.000Z",
  };

  it("par défaut enregistre créés + SLA, pas les non résolus", () => {
    const patch = pickSavePatch(full, {});
    expect(patch.demandesItHebdo).toBe(15);
    expect(patch.ticketsHorsSlaCloture).toBe(7);
    expect(patch.ticketsHorsSlaPriseEnCharge).toBe(1);
    expect(patch.demandesNonResoluesHebdo).toBeUndefined();
  });

  it("permet de n’enregistrer que les créés", () => {
    const patch = pickSavePatch(full, {
      demandesItHebdo: true,
      demandesNonResoluesHebdo: false,
      ticketsHorsSlaCloture: false,
      ticketsHorsSlaPriseEnCharge: false,
      ticketsBreakdown: false,
    });
    expect(patch).toEqual({
      jiraSyncedAt: full.jiraSyncedAt,
      demandesItHebdo: 15,
    });
  });
});

describe("describeSaveFields", () => {
  it("liste les libellés cochés", () => {
    const labels = describeSaveFields({
      demandesItHebdo: true,
      ticketsHorsSlaCloture: true,
      ticketsHorsSlaPriseEnCharge: false,
      demandesNonResoluesHebdo: false,
      ticketsBreakdown: false,
      ticketsByRequester: false,
    });
    expect(labels).toEqual(["tickets créés", "hors SLA clôture"]);
  });

  it("inclut la répartition demandeurs", () => {
    const labels = describeSaveFields({
      demandesItHebdo: false,
      ticketsHorsSlaCloture: false,
      ticketsHorsSlaPriseEnCharge: false,
      demandesNonResoluesHebdo: false,
      ticketsBreakdown: false,
      ticketsByRequester: true,
    });
    expect(labels).toEqual(["répartition demandeurs"]);
  });
});
