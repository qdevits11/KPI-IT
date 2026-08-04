import { describe, expect, it } from "vitest";
import { buildWeekJql, isoWeekDateRange, mockJiraWeekStats } from "./jira";
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
  it("construit les 4 JQL comme le workflow n8n", () => {
    const jql = buildWeekJql(conn, 2026, 31);
    expect(jql.created).toBe(
      '(project = CSD) AND created >= "2026-07-27" AND created < "2026-08-03"',
    );
    expect(jql.open).toBe(
      "(project = CSD) AND status NOT IN (Partenaire, Canceled, Done)",
    );
    expect(jql.priseEnCharge).toContain('"Date Prise en Charge" >= "2026-07-27"');
    expect(jql.priseEnCharge).toContain('"Date Prise en Charge" < "2026-08-03"');
    expect(jql.resolved).toContain('resolutiondate >= "2026-07-27"');
    expect(jql.resolved).toContain('resolutiondate < "2026-08-03"');
  });
});

describe("getBusinessHours (n8n)", () => {
  it("compte > 24h ouvrées sur un délai qui traverse un week-end", () => {
    // Vendredi 10:00 → Lundi 11:00 = ~25h ouvrées (ven 14h + lun 11h)
    const start = new Date("2026-07-24T10:00:00"); // vendredi
    const end = new Date("2026-07-27T11:00:00"); // lundi
    const hours = getBusinessHours(start, end);
    expect(hours).toBeGreaterThan(24);
  });

  it("compte hors SLA 48h comme n8n", () => {
    const count = countOverBusinessSla(
      [
        {
          created: "2026-07-20T09:00:00.000Z",
          eventDate: "2026-07-23T10:00:00.000Z", // > 48h ouvrées
        },
        {
          created: "2026-07-27T09:00:00.000Z",
          eventDate: "2026-07-27T12:00:00.000Z", // 3h
        },
        {
          created: "2026-07-27T09:00:00.000Z",
          eventDate: null,
        },
      ],
      48,
    );
    expect(count).toBe(1);
  });

  it("compte hors SLA 24h prise en charge", () => {
    const count = countOverBusinessSla(
      [
        {
          created: "2026-07-27T08:00:00.000Z",
          eventDate: "2026-07-28T10:00:00.000Z", // > 24h ouvrées
        },
        {
          created: "2026-07-27T08:00:00.000Z",
          eventDate: "2026-07-27T12:00:00.000Z",
        },
      ],
      24,
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
