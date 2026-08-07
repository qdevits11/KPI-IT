import type { KpiValue } from "@/lib/types";
import {
  formatKpiValue,
  formatDelta,
  deltaToneClass,
  statusLabel,
  sourceLabel,
} from "@/lib/format";

const STATUS_CLASS: Record<KpiValue["status"], string> = {
  ok: "text-[var(--ok)]",
  warning: "text-[var(--warn)]",
  critical: "text-[var(--crit)]",
  na: "text-[var(--muted)]",
};

export function KpiCard({ kpi }: { kpi: KpiValue }) {
  const deltaLabel = formatDelta(kpi.deltaVsPrev);

  return (
    <article className="kpi-card group relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 transition-transform duration-300 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
          {sourceLabel(kpi.source)}
        </p>
        <span className={`text-xs font-medium ${STATUS_CLASS[kpi.status]}`}>
          {statusLabel(kpi.status)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)] tabular-nums">
          {formatKpiValue(kpi)}
        </h3>
        {deltaLabel && (
          <span
            className={`text-sm font-medium tabular-nums ${deltaToneClass(kpi.deltaVsPrev, kpi.higherIsBetter)}`}
            title="Écart vs semaine précédente"
          >
            {deltaLabel}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">{kpi.label}</p>
      {kpi.target !== null && (
        <p className="mt-2 text-xs text-[var(--muted)]">Cible : ≤ {kpi.target}</p>
      )}
    </article>
  );
}
