/**
 * Date → année / mois / semaine ISO (aligné Excel KPI + sélecteur semaine).
 * Calcul en UTC-date (YYYY-MM-DD) pour rester stable côté navigateur / serveur.
 */

export interface IsoWeekParts {
  year: number;
  week: number;
  month: number;
}

/** Parse "YYYY-MM-DD" en composants locaux neutres (pas de fuseau). */
export function parseIsoDate(iso: string): { y: number; m: number; d: number } {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`date invalide: ${iso}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** Aujourd'hui en YYYY-MM-DD (Europe/Brussels si Intl dispo). */
export function todayIsoDate(now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Brussels",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

/**
 * Semaine ISO à partir d'une date calendaire YYYY-MM-DD.
 * month = mois civil de la date (comme les feuilles Excel).
 */
export function isoWeekPartsFromDate(isoDate: string): IsoWeekParts {
  const { y, m, d } = parseIsoDate(isoDate);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const isoYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { year: isoYear, week, month: m };
}

export function weekIdFromDate(isoDate: string): string {
  const { year, week } = isoWeekPartsFromDate(isoDate);
  return `${year}-S${String(week).padStart(2, "0")}`;
}

/** Lundi (YYYY-MM-DD) de la semaine ISO donnée. */
export function mondayOfIsoWeek(year: number, week: number): string {
  // Jeudi de la semaine ISO 1 = 4 janvier ± ajustement
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayW1 = new Date(jan4);
  mondayW1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const monday = new Date(mondayW1);
  monday.setUTCDate(mondayW1.getUTCDate() + (week - 1) * 7);
  const y = monday.getUTCFullYear();
  const m = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(monday.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatFrDate(isoDate: string): string {
  const { y, m, d } = parseIsoDate(isoDate);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}
