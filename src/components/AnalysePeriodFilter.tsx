"use client";

import { isoWeekPartsFromDate, todayIsoDate } from "@/lib/dates";
import { weekOptions, type WeekRange } from "@/lib/week-range";

type Props = {
  year: number;
  years: number[];
  weekFrom?: number;
  weekTo?: number;
  onYearChange: (year: number) => void;
  onRangeChange: (range: WeekRange) => void;
  /** Affiche un bouton « Toute l’année » si une plage est active. */
  showReset?: boolean;
};

function weekSelectValue(value: number | undefined): string {
  return value == null ? "all" : String(value);
}

/** Semaines sélectionnables : pas de semaines futures pour l’année en cours. */
function selectableWeeksForYear(year: number): number[] {
  const now = isoWeekPartsFromDate(todayIsoDate());
  if (year > now.year) return [];
  if (year < now.year) return weekOptions(53);
  return weekOptions(now.week);
}

export function AnalysePeriodFilter({
  year,
  years,
  weekFrom,
  weekTo,
  onYearChange,
  onRangeChange,
  showReset = true,
}: Props) {
  const hasRange = weekFrom != null || weekTo != null;
  const weeks = selectableWeeksForYear(year);
  const yearsOk = years.filter((y) => {
    const now = isoWeekPartsFromDate(todayIsoDate());
    return y <= now.year;
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <span className="text-xs uppercase tracking-[0.14em]">Année</span>
        <select
          value={year}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
        >
          {yearsOk.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <span className="text-xs uppercase tracking-[0.14em]">De</span>
        <select
          value={weekSelectValue(weekFrom)}
          onChange={(e) => {
            const v = e.target.value;
            onRangeChange({
              weekFrom: v === "all" ? undefined : Number(v),
              weekTo,
            });
          }}
          className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          aria-label="Semaine de début"
        >
          <option value="all">Début</option>
          {weeks.map((w) => (
            <option key={w} value={w}>
              S{String(w).padStart(2, "0")}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <span className="text-xs uppercase tracking-[0.14em]">À</span>
        <select
          value={weekSelectValue(weekTo)}
          onChange={(e) => {
            const v = e.target.value;
            onRangeChange({
              weekFrom,
              weekTo: v === "all" ? undefined : Number(v),
            });
          }}
          className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          aria-label="Semaine de fin"
        >
          <option value="all">Fin</option>
          {weeks.map((w) => (
            <option key={w} value={w}>
              S{String(w).padStart(2, "0")}
            </option>
          ))}
        </select>
      </label>

      {showReset && hasRange && (
        <button
          type="button"
          onClick={() => onRangeChange({})}
          className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
        >
          Toute l’année
        </button>
      )}
    </div>
  );
}
