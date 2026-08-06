import { describe, expect, it } from "vitest";
import {
  aggregateByAssignee,
  buildTicketSearchJql,
  describeTicketFilters,
  filterTicketList,
  jiraBrowseUrl,
  ticketAgeDays,
  type TicketListItem,
} from "./jira-tickets";
import type { JiraConnection } from "./jira-auth";
import { DEFAULT_JIRA_SETTINGS } from "./jira-auth";

function ticket(partial: Partial<TicketListItem> & Pick<TicketListItem, "key">): TicketListItem {
  return {
    summary: "Test",
    created: "2026-08-01T10:00:00.000Z",
    ageDays: 4,
    status: "In Progress",
    assignee: "Alice",
    requester: "Bob",
    type: "Odoo",
    browseUrl: "https://x.atlassian.net/browse/" + partial.key,
    ...partial,
  };
}

const conn = {
  ...DEFAULT_JIRA_SETTINGS,
  baseUrl: "https://example.atlassian.net",
  email: "a@b.c",
  apiToken: "t",
  connectedAt: "2026-01-01",
} as JiraConnection;

describe("jira-tickets helpers", () => {
  it("calcule l’âge en jours", () => {
    const now = new Date("2026-08-05T12:00:00.000Z");
    expect(ticketAgeDays("2026-08-05T08:00:00.000Z", now)).toBe(0);
    expect(ticketAgeDays("2026-08-01T12:00:00.000Z", now)).toBe(4);
  });

  it("construit l’URL browse", () => {
    expect(jiraBrowseUrl("https://x.atlassian.net/", "CSD-1")).toBe(
      "https://x.atlassian.net/browse/CSD-1",
    );
  });

  it("agrège par assigné avec Non assigné en tête", () => {
    const groups = aggregateByAssignee([
      ticket({ key: "A-1", assignee: "Marie", type: "Odoo", ageDays: 2 }),
      ticket({ key: "A-2", assignee: "Marie", type: "Teams", ageDays: 10 }),
      ticket({ key: "A-3", assignee: "Non assigné", type: "Odoo", ageDays: 1 }),
      ticket({ key: "A-4", assignee: "Gary", type: "Odoo", ageDays: 3 }),
    ]);
    expect(groups[0]?.name).toBe("Non assigné");
    expect(groups[0]?.count).toBe(1);
    const marie = groups.find((g) => g.name === "Marie");
    expect(marie?.count).toBe(2);
    expect(marie?.byType).toEqual({ Odoo: 1, Teams: 1 });
    expect(marie?.oldestAgeDays).toBe(10);
    expect(marie?.avgAgeDays).toBe(6);
  });

  it("filtre localement type / assigné / demandeur", () => {
    const list = [
      ticket({ key: "1", assignee: "Marie", type: "Odoo", requester: "Alice" }),
      ticket({ key: "2", assignee: "Marie", type: "Teams", requester: "Bob" }),
      ticket({ key: "3", assignee: "Gary", type: "Odoo", requester: "Alice" }),
    ];
    expect(filterTicketList(list, { assignee: "Marie" }).map((t) => t.key)).toEqual([
      "1",
      "2",
    ]);
    expect(filterTicketList(list, { type: "Odoo", requester: "Alice" }).map((t) => t.key)).toEqual([
      "1",
      "3",
    ]);
  });

  it("construit un JQL open / created / SLA", () => {
    expect(buildTicketSearchJql(conn, { scope: "open" })).toContain(
      "status NOT IN",
    );
    expect(buildTicketSearchJql(conn, { scope: "open", assignee: "Non assigné" })).toContain(
      "assignee is EMPTY",
    );
    const weekJql = buildTicketSearchJql(conn, {
      scope: "created",
      weekId: "2026-S32",
      assignee: "Marie Dupont",
    });
    expect(weekJql).toContain('created >= "2026-08-03');
    expect(weekJql).toContain('assignee = "Marie Dupont"');

    const slaPecJql = buildTicketSearchJql(conn, {
      scope: "sla_pec",
      weekId: "2026-S32",
    });
    expect(slaPecJql).toContain(conn.datePriseEnChargeJql);
    expect(slaPecJql).toContain('>= "2026-08-03 00:00"');

    const slaCloseJql = buildTicketSearchJql(conn, {
      scope: "sla_cloture",
      weekId: "2026-S32",
    });
    expect(slaCloseJql).toContain("resolutiondate >=");
  });

  it("décrit les filtres SLA", () => {
    expect(
      describeTicketFilters({
        scope: "sla_pec",
        weekId: "2026-S32",
      }),
    ).toBe("hors SLA prise en charge · semaine 2026-S32");
    expect(
      describeTicketFilters({
        scope: "sla_cloture",
        weekId: "2026-S32",
      }),
    ).toBe("hors SLA clôture · semaine 2026-S32");
  });

  it("décrit les filtres", () => {
    expect(
      describeTicketFilters({
        scope: "created",
        year: 2026,
        type: "Odoo",
        assignee: "Marie",
      }),
    ).toBe("créés · année 2026 · assigné : Marie · type : Odoo");
  });
});
