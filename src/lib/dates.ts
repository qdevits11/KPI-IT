/**
 * Date → année / mois / semaine ISO (sélecteur semaine).
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
 * month = mois civil de la date.
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

/** Semaine ISO courante (Europe/Brussels). */
export function currentIsoWeekId(now = new Date()): string {
  return weekIdFromDate(todayIsoDate(now));
}

/**
 * Semaine strictement postérieure à la semaine ISO courante.
 * Les ids `YYYY-Snn` se comparent lexicographiquement.
 */
export function isFutureWeekId(id: string, now = new Date()): boolean {
  return id > currentIsoWeekId(now);
}

/** Borne un weekId au présent : futur / invalide → semaine courante. */
export function clampWeekIdToCurrent(
  id: string | null | undefined,
  now = new Date(),
): string {
  const current = currentIsoWeekId(now);
  if (!id || !/^\d{4}-S\d{2}$/.test(id) || id > current) return current;
  return id;
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

const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

/** Dimanche (YYYY-MM-DD) de la semaine ISO donnée. */
export function sundayOfIsoWeek(year: number, week: number): string {
  const monday = mondayOfIsoWeek(year, week);
  const { y, m, d } = parseIsoDate(monday);
  const utc = new Date(Date.UTC(y, m - 1, d + 6));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Libellé type « 4 – 10 août 2026 » pour une semaine ISO. */
export function formatWeekRangeLabel(year: number, week: number): string {
  const start = mondayOfIsoWeek(year, week);
  const end = sundayOfIsoWeek(year, week);
  const a = parseIsoDate(start);
  const b = parseIsoDate(end);
  if (a.y === b.y && a.m === b.m) {
    return `${a.d} – ${b.d} ${MONTHS_FR[a.m - 1]} ${a.y}`;
  }
  if (a.y === b.y) {
    return `${a.d} ${MONTHS_FR[a.m - 1]} – ${b.d} ${MONTHS_FR[b.m - 1]} ${a.y}`;
  }
  return `${a.d} ${MONTHS_FR[a.m - 1]} ${a.y} – ${b.d} ${MONTHS_FR[b.m - 1]} ${b.y}`;
}
