import {
  BUSINESS_TIMEZONE,
  brusselsWallToUtc,
  toBrusselsDateStr,
} from "./business-hours";
import { currentIsoWeek, isoWeekDateRange, previousIsoWeek } from "./jira";

/** Parties calendrier Europe/Brussels */
function brusselsParts(date: Date): {
  weekday: number;
  hour: number;
  minute: number;
  year: number;
  month: number;
  day: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const wd: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    weekday: wd[get("weekday")] ?? 0,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

/**
 * Fenêtre de figement : dimanche 23:50–23:59 Bruxelles,
 * ou rattrapage lundi 00:00–00:14.
 */
export function isOpenSnapshotWindow(now = new Date()): boolean {
  const p = brusselsParts(now);
  if (p.weekday === 0 && p.hour === 23 && p.minute >= 50) return true;
  if (p.weekday === 1 && p.hour === 0 && p.minute < 15) return true;
  return false;
}

/**
 * Semaine ISO à figer pour le stock « non résolus ».
 * - Dimanche soir → semaine courante (qui se termine à minuit)
 * - Lundi tout début → semaine précédente
 */
export function weekToFreezeOpenSnapshot(
  now = new Date(),
): { year: number; week: number; reason: string } | null {
  const p = brusselsParts(now);
  if (p.weekday === 0 && p.hour === 23 && p.minute >= 50) {
    // Ancrer à dimanche midi Bruxelles pour l'ISO week
    const sundayNoon = brusselsWallToUtc(p.year, p.month, p.day, 12, 0, 0);
    const cur = currentIsoWeek(sundayNoon);
    return {
      ...cur,
      reason: "dimanche 23:50+ Europe/Brussels — fin de semaine ISO",
    };
  }
  if (p.weekday === 1 && p.hour === 0 && p.minute < 15) {
    // Ancrer à midi Bruxelles du lundi pour éviter le décalage UTC/CEST
    const mondayNoon = brusselsWallToUtc(p.year, p.month, p.day, 12, 0, 0);
    const prev = previousIsoWeek(mondayNoon);
    return {
      ...prev,
      reason: "lundi 00:00–00:14 Europe/Brussels — rattrapage",
    };
  }
  return null;
}

/** La semaine ISO est terminée (maintenant ≥ lundi suivant 00:00 Bruxelles). */
export function isIsoWeekCompleted(
  year: number,
  week: number,
  now = new Date(),
): boolean {
  const { endExclusive } = isoWeekDateRange(year, week);
  const [y, m, d] = endExclusive.split("-").map(Number);
  const end = brusselsWallToUtc(y!, m!, d!, 0, 0, 0, 0);
  return now.getTime() >= end.getTime();
}

export function describeBrusselsNow(now = new Date()): string {
  const p = brusselsParts(now);
  const days = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
  return `${days[p.weekday]} ${toBrusselsDateStr(now)} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")} ${BUSINESS_TIMEZONE}`;
}
