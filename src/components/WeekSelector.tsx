"use client";

interface WeekOption {
  id: string;
  label: string;
}

interface Props {
  weeks: WeekOption[];
  value: string;
  onChange: (weekId: string) => void;
  currentWeekId?: string;
}

export function WeekSelector({ weeks, value, onChange, currentWeekId }: Props) {
  return (
    <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
      <span className="text-xs uppercase tracking-[0.14em]">Semaine</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
      >
        {weeks.map((w) => (
          <option key={w.id} value={w.id}>
            {w.label.includes("en cours")
              ? w.label
              : currentWeekId && w.id === currentWeekId
                ? `${w.label} · en cours`
                : w.label}
          </option>
        ))}
      </select>
    </label>
  );
}
