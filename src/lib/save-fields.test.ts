import { describe, expect, it } from "vitest";
import {
  pickSavePatch,
  describeSaveFields,
  resolveBreakdownFlags,
  pickClearKpiPatch,
  anySaveFieldSelected,
} from "./save-fields";

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
      ticketsByType: false,
      ticketsByAssignee: false,
      ticketsByRequester: false,
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
      ticketsByType: false,
      ticketsByAssignee: false,
      ticketsByRequester: false,
    });
    expect(labels).toEqual(["tickets créés", "hors SLA clôture"]);
  });

  it("sépare responsables, demandeurs et types", () => {
    const labels = describeSaveFields({
      demandesItHebdo: false,
      ticketsHorsSlaCloture: false,
      ticketsHorsSlaPriseEnCharge: false,
      demandesNonResoluesHebdo: false,
      ticketsByType: true,
      ticketsByAssignee: true,
      ticketsByRequester: true,
    });
    expect(labels).toEqual(["types", "responsables", "demandeurs"]);
  });
});

describe("resolveBreakdownFlags", () => {
  it("honore l’ancien ticketsBreakdown", () => {
    expect(
      resolveBreakdownFlags({
        ticketsBreakdown: true,
        ticketsByRequester: false,
      }),
    ).toEqual({ type: true, assignee: true, requester: false });
  });
});

describe("pickClearKpiPatch", () => {
  it("remet à null les KPI cochés", () => {
    const patch = pickClearKpiPatch({
      demandesItHebdo: true,
      ticketsHorsSlaCloture: true,
      ticketsHorsSlaPriseEnCharge: false,
      demandesNonResoluesHebdo: false,
    });
    expect(patch.demandesItHebdo).toBeNull();
    expect(patch.ticketsHorsSlaCloture).toBeNull();
    expect(patch.ticketsHorsSlaPriseEnCharge).toBeUndefined();
  });
});

describe("anySaveFieldSelected", () => {
  it("détecte une sélection vide", () => {
    expect(
      anySaveFieldSelected({
        demandesItHebdo: false,
        demandesNonResoluesHebdo: false,
        ticketsHorsSlaCloture: false,
        ticketsHorsSlaPriseEnCharge: false,
        ticketsByType: false,
        ticketsByAssignee: false,
        ticketsByRequester: false,
      }),
    ).toBe(false);
  });
});
