import type {
  AppDatabase,
  TicketStatDimension,
  TicketStatRow,
  TicketStatsPayload,
} from "./types";
import { weekId } from "./types";

export const STAT_DIMENSIONS: Record<
  TicketStatDimension,
  { label: string; description: string; href: string }
> = {
  assignee: {
    label: "Par assigné",
    description:
      "Tickets créés groupés par la personne assignée dans Jira (champ assignee).",
    href: "/analyse/par-assigne",
  },
  requester: {
    label: "Par demandeur",
    description:
      "Nombre de tickets ouverts par chaque demandeur (reporter Jira).",
    href: "/analyse/par-demandeur",
  },
  type: {
    label: "Par type de demande",
    description:
      "Répartition des tickets créés selon le type / catégorie (composant, label…).",
    href: "/analyse/par-type",
  },
};

function sourceFor(
  db: AppDatabase,
  dimension: TicketStatDimension,
): Record<string, Record<string, number>> {
  if (dimension === "assignee") return db.ticketsByAssignee ?? {};
  if (dimension === "requester") return db.ticketsByRequester ?? {};
  return db.ticketsByType ?? {};
}

/** Semaines de l’année à afficher dans les stats.

 * Inclut les semaines vides en tête (ex. S01 à 0), depuis la première
 * semaine connue jusqu’à la dernière avec activité. Coupe seulement
 * la queue (semaines futures sans données).
 */
export function weeksForYear(
  db: AppDatabase,
  year: number,
  source?: Record<string, Record<string, number>>,
): string[] {
  const weekKeys = new Set<string>();

  for (const w of db.weeks) {
    if (w.year === year) weekKeys.add(weekId(w));
  }
  if (source) {
    for (const k of Object.keys(source)) {
      if (k.startsWith(`${year}-S`)) weekKeys.add(k);
    }
  }

  const sorted = [...weekKeys].sort();
  if (sorted.length === 0) return [];

  const hasActivity = (key: string): boolean => {
    if (source && Object.values(source[key] ?? {}).some((n) => n > 0)) {
      return true;
    }
    const row = db.weeks.find((w) => weekId(w) === key);
    return (row?.demandesItHebdo ?? 0) > 0;
  };

  let lastActive = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (hasActivity(sorted[i])) {
      lastActive = i;
      break;
    }
  }

  // Aucune activité : garder toute la liste déclarée (ex. année vide)
  if (lastActive < 0) return sorted;

  // S01…dernière semaine active (les zéros de tête restent comptabilisés)
  return sorted.slice(0, lastActive + 1);
}

/**
 * Agrège une ventilation hebdo en tableau (lignes × semaines) + totaux.
 * Les zéros purs sont exclus sauf si hideZeros=false.
 */
export function buildTicketStats(
  db: AppDatabase,
  year: number,
  dimension: TicketStatDimension,
  options?: { hideZeros?: boolean },
): TicketStatsPayload {
  const hideZeros = options?.hideZeros !== false;
  const meta = STAT_DIMENSIONS[dimension];
  const source = sourceFor(db, dimension);
  const weeks = weeksForYear(db, year, source);

  const names = new Set<string>();
  for (const wk of weeks) {
    for (const name of Object.keys(source[wk] ?? {})) {
      names.add(name);
    }
  }

  const weekTotals: Record<string, number> = {};
  for (const wk of weeks) weekTotals[wk] = 0;

  const rows: TicketStatRow[] = [...names]
    .map((name) => {
      const byWeek: Record<string, number> = {};
      let total = 0;
      for (const wk of weeks) {
        const n = source[wk]?.[name] ?? 0;
        byWeek[wk] = n;
        total += n;
        weekTotals[wk] += n;
      }
      return { name, total, byWeek, share: 0 };
    })
    .filter((r) => !hideZeros || r.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "fr"));

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  for (const row of rows) {
    row.share = grandTotal > 0 ? row.total / grandTotal : 0;
  }

  return {
    year,
    dimension,
    label: meta.label,
    description: meta.description,
    weeks,
    rows,
    grandTotal,
    weekTotals,
  };
}

/** Résumé hub : top N par dimension. */
export function buildStatsOverview(
  db: AppDatabase,
  year: number,
  topN = 5,
): Array<{
  dimension: TicketStatDimension;
  label: string;
  href: string;
  description: string;
  grandTotal: number;
  top: Array<{ name: string; total: number; share: number }>;
}> {
  return (Object.keys(STAT_DIMENSIONS) as TicketStatDimension[]).map((dim) => {
    const stats = buildTicketStats(db, year, dim);
    return {
      dimension: dim,
      label: stats.label,
      href: STAT_DIMENSIONS[dim].href,
      description: stats.description,
      grandTotal: stats.grandTotal,
      top: stats.rows.slice(0, topN).map((r) => ({
        name: r.name,
        total: r.total,
        share: r.share,
      })),
    };
  });
}
