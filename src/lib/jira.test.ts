import { describe, expect, it } from "vitest";
import {
  buildWeekJql,
  isoWeekDateRange,
  mockJiraWeekStats,
  previousIsoWeek,
} from "./jira";
import { DEFAULT_JIRA_SETTINGS, type JiraConnection } from "./jira-auth";
import {
  countOverBusinessSla,
  getBusinessHours,
  parseJiraDate,
  toBrusselsDateStr,
  brusselsWallToUtc,
} from "./business-hours";

const conn: JiraConnection = {
  baseUrl: "https://coverseal.atlassian.net",
  email: "it@coverseal.com",
  apiToken: "token",
  ...DEFAULT_JIRA_SETTINGS,
  connectedAt: "2026-01-01",
};

describe("isoWeekDateRange", () => {
  it("donne lundi → lundi suivant pour 2026-S31", () => {
    const { start, endExclusive, endInclusive } = isoWeekDateRange(2026, 31);
    expect(start).toBe("2026-07-27");
    expect(endExclusive).toBe("2026-08-03");
    expect(endInclusive).toBe("2026-08-02");
  });
});

describe("buildWeekJql (bornes absolues reproductibles)", () => {
  it("utilise des datetimes absolus pour toute semaine (y compris précédente)", () => {
    const now = new Date("2026-08-03T10:00:00Z");
    const prev = previousIsoWeek(now);
    expect(prev).toEqual({ year: 2026, week: 31 });

    const jql = buildWeekJql(conn, 2026, 31);
    expect(jql.usedRelativeWeekFunctions).toBe(false);
    expect(jql.created).toContain('created >= "2026-07-27 00:00"');
    expect(jql.created).toContain('created < "2026-08-03 00:00"');
    expect(jql.priseEnCharge).toContain(
      '"Date Prise en Charge" >= "2026-07-27 00:00"',
    );
    expect(jql.resolved).toContain('resolutiondate >= "2026-07-27 00:00"');
    expect(jql.open).toContain("status NOT IN (Partenaire, Canceled, Done)");
  });

  it("utilise les mêmes bornes pour une semaine historique", () => {
    const jql = buildWeekJql(conn, 2026, 10);
    expect(jql.usedRelativeWeekFunctions).toBe(false);
    expect(jql.created).toContain("00:00");
  });
});

describe("getBusinessHours (Europe/Brussels)", () => {
  it("compte > 24h ouvrées sur un délai qui traverse un week-end", () => {
    const start = new Date("2026-07-24T10:00:00+02:00");
    const end = new Date("2026-07-27T11:00:00+02:00");
    expect(getBusinessHours(start, end)).toBeGreaterThan(24);
  });

  it("ignore le week-end en fuseau Bruxelles", () => {
    const start = brusselsWallToUtc(2026, 7, 24, 17, 0, 0);
    const end = brusselsWallToUtc(2026, 7, 27, 9, 0, 0);
    const hours = getBusinessHours(start, end);
    // Ven 17→24 = 7h + Lun 0→9 = 9h ≈ 16h (sam/dim exclus)
    expect(hours).toBeGreaterThan(15);
    expect(hours).toBeLessThan(18);
  });

  it("compte hors SLA 48h comme n8n", () => {
    const count = countOverBusinessSla(
      [
        {
          created: "2026-07-20T09:00:00.000Z",
          eventDate: "2026-07-23T10:00:00.000Z",
        },
        {
          created: "2026-07-27T09:00:00.000Z",
          eventDate: "2026-07-27T12:00:00.000Z",
        },
        { created: "2026-07-27T09:00:00.000Z", eventDate: null },
      ],
      48,
    );
    expect(count).toBe(1);
  });

  it("parse une date Jira date-only en minuit Bruxelles", () => {
    const d = parseJiraDate("2026-07-28");
    expect(d).not.toBeNull();
    expect(toBrusselsDateStr(d!)).toBe("2026-07-28");
  });
});

describe("mockJiraWeekStats", () => {
  it("utilise le projet CSD dans les JQL", () => {
    const r = mockJiraWeekStats(2026, 31);
    expect(r.jql.created).toContain("project = CSD");
    expect(r.jql.open).toContain("Partenaire");
  });

  it("expose les 4 KPI hebdo dans le patch", () => {
    const r = mockJiraWeekStats(2026, 12);
    expect(typeof r.patch.demandesItHebdo).toBe("number");
    expect(typeof r.patch.demandesNonResoluesHebdo).toBe("number");
    expect(typeof r.patch.ticketsHorsSlaCloture).toBe("number");
    expect(typeof r.patch.ticketsHorsSlaPriseEnCharge).toBe("number");
  });
});
