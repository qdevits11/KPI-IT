import { describe, expect, it } from "vitest";
import { buildWeekJql, isoWeekDateRange, mockJiraWeekStats } from "./jira";
import type { JiraConnection } from "./jira-auth";

const conn: JiraConnection = {
  baseUrl: "https://coverseal.atlassian.net",
  email: "it@coverseal.com",
  apiToken: "token",
  jqlBase: "project = IT",
  slaResolution: "Time to resolution",
  slaFirstResponse: "Time to first response",
  categoryField: "component",
  connectedAt: "2026-01-01",
};

describe("isoWeekDateRange", () => {
  it("donne lundi–dimanche pour 2026-S31", () => {
    const { start, end } = isoWeekDateRange(2026, 31);
    expect(start).toBe("2026-07-27");
    expect(end).toBe("2026-08-02");
  });
});

describe("buildWeekJql", () => {
  it("construit les 4 JQL KPI pour une semaine", () => {
    const jql = buildWeekJql(conn, 2026, 31);
    expect(jql.created).toContain('created >= "2026-07-27"');
    expect(jql.created).toContain('created <= "2026-08-02 23:59"');
    expect(jql.created).toContain("project = IT");

    expect(jql.openAtWeekEnd).toContain("resolution is EMPTY");
    expect(jql.openAtWeekEnd).toContain('resolved > "2026-08-02 23:59"');

    expect(jql.slaResolutionBreached).toContain(
      '"Time to resolution" = breached()',
    );
    expect(jql.slaResolutionBreached).toContain('resolved >= "2026-07-27"');

    expect(jql.slaFirstResponseBreached).toContain(
      '"Time to first response" = breached()',
    );
    expect(jql.slaFirstResponseBreached).toContain('created >= "2026-07-27"');
  });

  it("échappe les guillemets dans les noms de SLA", () => {
    const jql = buildWeekJql(
      { ...conn, slaResolution: 'SLA "critique"' },
      2026,
      10,
    );
    expect(jql.slaResolutionBreached).toContain('"SLA \\"critique\\""');
  });
});

describe("mockJiraWeekStats", () => {
  it("remplit aussi les hors-SLA", () => {
    const r = mockJiraWeekStats(2026, 31);
    expect(r.patch.demandesItHebdo).toBeGreaterThan(0);
    expect(r.patch.ticketsHorsSlaCloture).not.toBeNull();
    expect(r.jql.created).toContain("created");
  });
});
