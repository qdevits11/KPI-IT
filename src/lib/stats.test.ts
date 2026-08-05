import { describe, expect, it } from "vitest";
import {
  buildStatsOverview,
  buildTicketStats,
  weeksForYear,
} from "./stats";
import type { AppDatabase } from "./types";

function fixture(): AppDatabase {
  return {
    year: 2026,
    weeks: [
      {
        year: 2026,
        month: 1,
        week: 1,
        ticketsHorsSlaCloture: null,
        ticketsHorsSlaPriseEnCharge: null,
        demandesItHebdo: 0,
        demandesNonResoluesHebdo: 0,
        openFrozenAt: null,
        informations: "",
        reaction: "",
        jiraSyncedAt: null,
        updatedAt: null,
      },
      {
        year: 2026,
        month: 7,
        week: 30,
        ticketsHorsSlaCloture: null,
        ticketsHorsSlaPriseEnCharge: null,
        demandesItHebdo: 10,
        demandesNonResoluesHebdo: 5,
        openFrozenAt: null,
        informations: "",
        reaction: "",
        jiraSyncedAt: null,
        updatedAt: null,
      },
      {
        year: 2026,
        month: 8,
        week: 31,
        ticketsHorsSlaCloture: null,
        ticketsHorsSlaPriseEnCharge: null,
        demandesItHebdo: 14,
        demandesNonResoluesHebdo: 6,
        openFrozenAt: null,
        informations: "",
        reaction: "",
        jiraSyncedAt: null,
        updatedAt: null,
      },
      {
        year: 2026,
        month: 12,
        week: 52,
        ticketsHorsSlaCloture: null,
        ticketsHorsSlaPriseEnCharge: null,
        demandesItHebdo: 0,
        demandesNonResoluesHebdo: null,
        openFrozenAt: null,
        informations: "",
        reaction: "",
        jiraSyncedAt: null,
        updatedAt: null,
      },
    ],
    automationsMetier: [],
    automationsOdoo: [],
    phishing: [],
    maintenances: [],
    ticketsByType: {
      "2026-S01": { Odoo: 0, Teams: 0 },
      "2026-S30": { Odoo: 4, Teams: 2, Elfsquad: 0 },
      "2026-S31": { Odoo: 6, Teams: 1, Extract: 3 },
    },
    ticketsByAssignee: {
      "2026-S30": { "Gary Schreurs": 5, "Loic Voumard": 3 },
      "2026-S31": { "Gary Schreurs": 7, "Devits Quentin": 4 },
    },
    ticketsByRequester: {
      "2026-S30": { "Alice Martin": 6, "Bruno Dupont": 2 },
      "2026-S31": { "Alice Martin": 5, "Claire Leroy": 4 },
    },
    settings: {
      companyName: "Test",
      jiraConfigured: false,
      responsibles: ["Gary", "Loic"],
      accessUsers: [],
      peopleDirectory: {},
    },
  };
}

describe("buildTicketStats", () => {
  it("agrège les volumes par assigné sur l’année", () => {
    const stats = buildTicketStats(fixture(), 2026, "assignee");
    expect(stats.weeks).toEqual(["2026-S01", "2026-S30", "2026-S31"]);
    expect(stats.grandTotal).toBe(5 + 3 + 7 + 4);
    expect(stats.rows[0]).toMatchObject({
      name: "Gary Schreurs",
      total: 12,
    });
    expect(stats.rows[0].byWeek["2026-S30"]).toBe(5);
    expect(stats.rows[0].byWeek["2026-S01"]).toBe(0);
    expect(stats.rows[0].share).toBeCloseTo(12 / 19);
  });

  it("exclut les types à total zéro", () => {
    const stats = buildTicketStats(fixture(), 2026, "type");
    expect(stats.rows.find((r) => r.name === "Elfsquad")).toBeUndefined();
    expect(stats.rows.find((r) => r.name === "Odoo")?.total).toBe(10);
  });

  it("agrège les demandeurs", () => {
    const stats = buildTicketStats(fixture(), 2026, "requester");
    expect(stats.rows.find((r) => r.name === "Alice Martin")?.total).toBe(11);
    expect(stats.grandTotal).toBe(17);
  });
});

describe("buildStatsOverview", () => {
  it("renvoie un top par dimension", () => {
    const overview = buildStatsOverview(fixture(), 2026, 2);
    expect(overview).toHaveLength(3);
    const assignee = overview.find((o) => o.dimension === "assignee");
    expect(assignee?.top).toHaveLength(2);
    expect(assignee?.top[0].name).toBe("Gary Schreurs");
  });
});

describe("weeksForYear", () => {
  it("garde S01 vide et coupe la queue sans activité", () => {
    const db = fixture();
    db.ticketsByType["2026-S29"] = { Odoo: 1 };
    expect(weeksForYear(db, 2026, db.ticketsByType)).toEqual([
      "2026-S01",
      "2026-S29",
      "2026-S30",
      "2026-S31",
    ]);
  });

  it("inclut une semaine 1 à zéro dans le total des colonnes", () => {
    const stats = buildTicketStats(fixture(), 2026, "type");
    expect(stats.weeks[0]).toBe("2026-S01");
    expect(stats.weekTotals["2026-S01"]).toBe(0);
  });
});
