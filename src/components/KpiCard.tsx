import Link from "next/link";
import type { KpiValue } from "@/lib/types";
import { formatKpiValue, statusLabel } from "@/lib/format";

const STATUS_CLASS: Record<KpiValue["status"], string> = {
  ok: "text-[var(--ok)]",
  warning: "text-[var(--warn)]",
  critical: "text-[var(--crit)]",
  na: "text-[var(--muted)]",
};

interface Props {
  kpi: KpiValue;
}

export function KpiCard({ kpi }: Props) {
  return (
    <article className="kpi-card group relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 transition-transform duration-300 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
          {kpi.source === "jira" ? "Jira" : "Manuel"}
        </p>
        <span className={`text-xs font-medium ${STATUS_CLASS[kpi.status]}`}>
          {statusLabel(kpi.status)}
        </span>
      </div>
      <h3 className="mt-3 font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)] tabular-nums">
        {formatKpiValue(kpi)}
      </h3>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">{kpi.label}</p>
      {kpi.target !== null && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Cible : {kpi.target}
          {kpi.unit === "percent" ? " %" : kpi.unit === "hours" ? " h" : ""}
        </p>
      )}
      <Link
        href={`/formules#${kpi.formulaId}`}
        className="mt-3 inline-block text-xs text-[var(--accent)] underline-offset-2 hover:underline"
      >
        Voir la formule
      </Link>
    </article>
  );
}
