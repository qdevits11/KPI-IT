import type { KpiValue } from "@/lib/types";

export function formatKpiValue(kpi: KpiValue): string {
  if (kpi.value === null) return "—";
  return kpi.value.toLocaleString("fr-BE");
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
