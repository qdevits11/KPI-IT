import type { KpiValue } from "@/lib/types";

export function formatKpiValue(kpi: KpiValue): string {
  if (kpi.value === null) return "—";
  switch (kpi.unit) {
    case "percent":
      return `${kpi.value.toLocaleString("fr-BE", { maximumFractionDigits: 1 })} %`;
    case "hours":
      return `${kpi.value.toLocaleString("fr-BE", { maximumFractionDigits: 1 })} h`;
    case "minutes":
      return `${kpi.value.toLocaleString("fr-BE")} min`;
    default:
      return kpi.value.toLocaleString("fr-BE");
  }
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
