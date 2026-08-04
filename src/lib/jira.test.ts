import { describe, expect, it } from "vitest";
import {
  buildWeekJql,
  isoWeekDateRange,
  mockJiraWeekStats,
  previousIsoWeek,
} from "./jira";
import { DEFAULT_JIRA_SETTINGS, type JiraConnection } from "./jira-auth";
import { countOverBusinessSla, getBusinessHours } from "./business-hours";

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

describe("buildWeekJql (aligné n8n)", () => {
  it("utilise startOfWeek(-1) / startOfWeek() pour la semaine précédente", () => {
    // Lundi 3 août 2026 → semaine précédente = S31
    const now = new Date("2026-08-03T10:00:00Z");
    const prev = previousIsoWeek(now);
    expect(prev).toEqual({ year: 2026, week: 31 });

    const jql = buildWeekJql(conn, 2026, 31, now);
    expect(jql.usedRelativeWeekFunctions).toBe(true);
    expect(jql.created).toContain("project = CSD");
    expect(jql.created).toContain(
      "created >= startOfWeek(-1) AND created < startOfWeek()",
    );
    expect(jql.priseEnCharge).toContain(
      '"Date Prise en Charge" >= startOfWeek(-1)',
    );
    expect(jql.priseEnCharge).toContain(
      '"Date Prise en Charge" < startOfWeek()',
    );
    expect(jql.resolved).toContain("resolutiondate >= startOfWeek(-1)");
    expect(jql.resolved).toContain("resolutiondate < startOfWeek()");
    expect(jql.open).toContain("status NOT IN (Partenaire, Canceled, Done)");
  });

  it("utilise des dates absolues pour une semaine historique", () => {
    const now = new Date("2026-08-03T10:00:00Z");
    const jql = buildWeekJql(conn, 2026, 10, now);
    expect(jql.usedRelativeWeekFunctions).toBe(false);
    expect(jql.created).toContain('created >= "');
    expect(jql.created).toContain('created < "');
  });
});

describe("getBusinessHours (n8n)", () => {
  it("compte > 24h ouvrées sur un délai qui traverse un week-end", () => {
    const start = new Date("2026-07-24T10:00:00");
    const end = new Date("2026-07-27T11:00:00");
    expect(getBusinessHours(start, end)).toBeGreaterThan(24);
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
});

describe("mockJiraWeekStats", () => {
  it("utilise le projet CSD dans les JQL", () => {
    const r = mockJiraWeekStats(2026, 31);
    expect(r.jql.created).toContain("project = CSD");
    expect(r.jql.open).toContain("Partenaire");
  });
});
