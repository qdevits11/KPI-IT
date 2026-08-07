/**
 * Helpers purs pour le stock ouvert figé par assigné (utilisables côté client).
 */

import type { AssigneeOpenGroup, OpenTicketsSnapshot } from "./jira-tickets";

/** Agrège un bag assigné → count à partir d’un snapshot. */
export function countsByAssignee(
  byAssignee: AssigneeOpenGroup[],
): Record<string, number> {
  const bag: Record<string, number> = {};
  for (const g of byAssignee) {
    if (g.count > 0) bag[g.name] = g.count;
  }
  return bag;
}

/** Reconstitue un snapshot UI à partir d’un figement counts-only. */
export function openSnapshotFromAssigneeCounts(
  byAssignee: Record<string, number>,
  opts: {
    fetchedAt: string;
    jql?: string;
    warnings?: string[];
  },
): OpenTicketsSnapshot {
  const groups: AssigneeOpenGroup[] = Object.entries(byAssignee)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => ({
      name,
      count,
      byType: {},
      oldestAgeDays: 0,
      avgAgeDays: 0,
      tickets: [],
    }))
    .sort((a, b) => {
      if (a.name === "Non assigné") return -1;
      if (b.name === "Non assigné") return 1;
      return b.count - a.count || a.name.localeCompare(b.name, "fr");
    });
  const total = groups.reduce((sum, g) => sum + g.count, 0);
  return {
    fetchedAt: opts.fetchedAt,
    jql: opts.jql ?? "",
    total,
    unassigned: byAssignee["Non assigné"] ?? 0,
    tickets: [],
    byAssignee: groups,
    warnings: opts.warnings ?? [],
  };
}
