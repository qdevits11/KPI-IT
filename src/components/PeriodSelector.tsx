"use client";

import type { Period } from "@/lib/types";

interface Props {
  periods: Period[];
  value: string;
  onChange: (periodId: string) => void;
}

export function PeriodSelector({ periods, value, onChange }: Props) {
  return (
    <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
      <span className="uppercase tracking-[0.14em] text-xs">Période</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
      >
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}
