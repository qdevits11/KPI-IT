/**
 * Plage de semaines ISO pour les filtres Analyse.
 */

export type WeekRange = {
  weekFrom?: number;
  weekTo?: number;
};

/** Parse weekFrom / weekTo (1–53). Valeurs invalides → undefined. */
export function parseWeekRangeParam(
  weekFromRaw: string | null,
  weekToRaw: string | null,
): WeekRange {
  const parse = (raw: string | null): number | undefined => {
    if (raw == null || raw === "" || raw === "all") return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) return undefined;
    const w = Math.trunc(n);
    if (w < 1 || w > 53) return undefined;
    return w;
  };
  let weekFrom = parse(weekFromRaw);
  let weekTo = parse(weekToRaw);
  if (weekFrom != null && weekTo != null && weekFrom > weekTo) {
    [weekFrom, weekTo] = [weekTo, weekFrom];
  }
  return { weekFrom, weekTo };
}

export function weekNumberFromKey(weekKey: string): number | null {
  const m = weekKey.match(/-S(\d{2})$/);
  if (!m) return null;
  return Number(m[1]);
}

/** Filtre des clés `YYYY-Snn` selon une plage optionnelle. */
export function filterWeekKeysByRange(
  weekKeys: string[],
  range?: WeekRange,
): string[] {
  if (!range?.weekFrom && !range?.weekTo) return weekKeys;
  const lo = range.weekFrom ?? 1;
  const hi = range.weekTo ?? 53;
  return weekKeys.filter((key) => {
    const w = weekNumberFromKey(key);
    if (w == null) return false;
    return w >= lo && w <= hi;
  });
}

export function weekRangeQuery(range: WeekRange): string {
  const parts: string[] = [];
  if (range.weekFrom != null) {
    parts.push(`weekFrom=${encodeURIComponent(String(range.weekFrom))}`);
  }
  if (range.weekTo != null) {
    parts.push(`weekTo=${encodeURIComponent(String(range.weekTo))}`);
  }
  return parts.length ? `&${parts.join("&")}` : "";
}

export function weekOptions(max = 53): number[] {
  return Array.from({ length: max }, (_, i) => i + 1);
}
