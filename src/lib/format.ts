import type { KpiValue } from "@/lib/types";

export function formatKpiValue(kpi: KpiValue): string {
  if (kpi.value === null) return "—";
  return kpi.value.toLocaleString("fr-BE");
}

/** Affiche un écart absolu : +5, −3, =0. */
export function formatDelta(delta: number | null | undefined): string | null {
  if (delta == null || !Number.isFinite(delta)) return null;
  if (delta === 0) return "=0";
  const abs = Math.abs(delta).toLocaleString("fr-BE");
  return delta > 0 ? `+${abs}` : `−${abs}`;
}

/**
 * Couleur du delta : vert si l’évolution va dans le « bon » sens
 * (hausse si higherIsBetter, baisse sinon).
 */
export function deltaToneClass(
  delta: number | null | undefined,
  higherIsBetter: boolean,
): string {
  if (delta == null || delta === 0) return "text-[var(--muted)]";
  const good = higherIsBetter ? delta > 0 : delta < 0;
  return good ? "text-[var(--ok)]" : "text-[var(--crit)]";
}

export function statusLabel(status: KpiValue["status"]): string {
  switch (status) {
    case "ok":
      return "OK";
    case "warning":
      return "Attention";
    case "critical":
      return "Critique";
    default:
      return "N/A";
  }
}

export function sourceLabel(source: KpiValue["source"]): string {
  switch (source) {
    case "jira":
      return "Jira";
    case "manuel":
      return "Manuel";
    case "calcule":
      return "Calculé";
  }
}
