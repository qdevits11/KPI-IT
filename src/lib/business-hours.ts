/**
 * Heures ouvrées — calqué sur le workflow n8n Coverseal (Code nodes SLA).
 * Exclut samedi/dimanche + jours fériés belges.
 */

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

function toDateStr(date: Date): string {
  // Identique à n8n: date.toISOString().split("T")[0]
  return date.toISOString().split("T")[0]!;
}

export function isBusinessDay(date: Date, holidays = BE_HOLIDAYS): boolean {
  const day = date.getDay();
  const dateStr = toDateStr(date);
  return day !== 0 && day !== 6 && !holidays.has(dateStr);
}

/** Copie fidèle de getBusinessHours() du workflow n8n */
export function getBusinessHours(
  start: Date,
  end: Date,
  holidays = BE_HOLIDAYS,
): number {
  let totalMs = 0;
  const current = new Date(start);

  while (current < end) {
    if (isBusinessDay(current, holidays)) {
      const endOfDay = new Date(current);
      endOfDay.setHours(23, 59, 59, 999);

      const segmentEnd = endOfDay < end ? endOfDay : end;
      totalMs += segmentEnd.getTime() - current.getTime();
    }

    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  return totalMs / (1000 * 60 * 60);
}

export function countOverBusinessSla(
  items: Array<{ created: string; eventDate: string | null | undefined }>,
  thresholdHours: number,
  holidays = BE_HOLIDAYS,
): number {
  let count = 0;
  for (const item of items) {
    if (!item.eventDate) continue;
    const created = new Date(item.created);
    const event = new Date(item.eventDate);
    if (Number.isNaN(created.getTime()) || Number.isNaN(event.getTime())) {
      continue;
    }
    if (getBusinessHours(created, event, holidays) > thresholdHours) {
      count += 1;
    }
  }
  return count;
}
