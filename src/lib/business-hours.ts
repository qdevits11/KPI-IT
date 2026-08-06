/**
 * Heures ouvrées — calqué sur le workflow n8n Coverseal (Code nodes SLA).
 * Exclut samedi/dimanche + jours fériés belges.
 *
 * Important : calcul forcé en Europe/Brussels (comme le site Jira / n8n Coverseal).
 * Sur Vercel le runtime est UTC — sans ce fuseau, les SLA divergent de Excel/n8n.
 */

export const BUSINESS_TIMEZONE = "Europe/Brussels";

export const BE_HOLIDAYS = new Set([
  "2025-01-01",
  "2025-04-21",
  "2025-05-01",
  "2025-05-29",
  "2025-06-09",
  "2025-07-21",
  "2025-08-15",
  "2025-11-01",
  "2025-11-11",
  "2025-12-25",
  "2026-01-01",
  "2026-04-06",
  "2026-05-01",
  "2026-05-14",
  "2026-05-25",
  "2026-07-21",
  "2026-08-15",
  "2026-11-01",
  "2026-11-11",
  "2026-12-25",
  "2027-01-01",
  "2027-03-29",
  "2027-05-01",
  "2027-05-06",
  "2027-05-17",
  "2027-07-21",
  "2027-08-15",
  "2027-11-01",
  "2027-11-11",
  "2027-12-25",
]);

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = dimanche … 6 = samedi (comme Date#getDay) */
  weekday: number;
}

const weekdayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function zonedParts(date: Date, timeZone = BUSINESS_TIMEZONE): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

function dateStrFromParts(p: Pick<ZonedParts, "year" | "month" | "day">): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Offset ms : BrusselsWall - UTC instant, via format puis comparaison. */
function offsetMsAt(date: Date, timeZone = BUSINESS_TIMEZONE): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - date.getTime();
}

/** Instant UTC correspondant à une date/heure murale à Bruxelles. */
export function brusselsWallToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): Date {
  // 1er essai : interpréter comme UTC puis corriger l'offset Bruxelles
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
  const off1 = offsetMsAt(guess);
  guess = new Date(guess.getTime() - off1);
  const off2 = offsetMsAt(guess);
  if (off2 !== off1) {
    guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms) - off2);
  }
  return guess;
}

export function toBrusselsDateStr(date: Date): string {
  return dateStrFromParts(zonedParts(date));
}

export function isBusinessDay(date: Date, holidays = BE_HOLIDAYS): boolean {
  const p = zonedParts(date);
  return p.weekday !== 0 && p.weekday !== 6 && !holidays.has(dateStrFromParts(p));
}

/**
 * Copie fidèle de getBusinessHours() n8n, en Europe/Brussels.
 * Compte toutes les heures des jours ouvrés (pas seulement 9h–17h).
 */
export function getBusinessHours(
  start: Date,
  end: Date,
  holidays = BE_HOLIDAYS,
): number {
  if (!(start instanceof Date) || !(end instanceof Date)) return 0;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end <= start) return 0;

  let totalMs = 0;
  let current = new Date(start);

  while (current < end) {
    const p = zonedParts(current);
    const dateStr = dateStrFromParts(p);

    if (p.weekday !== 0 && p.weekday !== 6 && !holidays.has(dateStr)) {
      const endOfDay = brusselsWallToUtc(
        p.year,
        p.month,
        p.day,
        23,
        59,
        59,
        999,
      );
      const segmentEnd = endOfDay < end ? endOfDay : end;
      totalMs += segmentEnd.getTime() - current.getTime();
    }

    // Jour suivant 00:00 Bruxelles
    const noonNext = new Date(Date.UTC(p.year, p.month - 1, p.day + 1, 12));
    const next = zonedParts(noonNext);
    current = brusselsWallToUtc(next.year, next.month, next.day, 0, 0, 0, 0);
  }

  return totalMs / (1000 * 60 * 60);
}

/**
 * Parse une date Jira (ISO datetime ou date seule YYYY-MM-DD).
 * Date seule → 00:00 Europe/Brussels (début de journée locale Coverseal).
 */
export function parseJiraDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return brusselsWallToUtc(y!, m!, d!, 0, 0, 0, 0);
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function isOverBusinessSla(
  item: { created: string; eventDate: string | null | undefined },
  thresholdHours: number,
  holidays = BE_HOLIDAYS,
): boolean {
  if (!item.eventDate) return false;
  const created = parseJiraDate(item.created);
  const event = parseJiraDate(item.eventDate);
  if (!created || !event) return false;
  return getBusinessHours(created, event, holidays) > thresholdHours;
}

export function countOverBusinessSla(
  items: Array<{ created: string; eventDate: string | null | undefined }>,
  thresholdHours: number,
  holidays = BE_HOLIDAYS,
): number {
  let count = 0;
  for (const item of items) {
    if (isOverBusinessSla(item, thresholdHours, holidays)) count += 1;
  }
  return count;
}

export function filterOverBusinessSla<T extends { created: string; eventDate: string | null | undefined }>(
  items: T[],
  thresholdHours: number,
  holidays = BE_HOLIDAYS,
): T[] {
  return items.filter((item) =>
    isOverBusinessSla(item, thresholdHours, holidays),
  );
}
