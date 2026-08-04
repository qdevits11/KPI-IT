import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default function HomePage() {
  // Semaine 31 = dernière semaine renseignée dans KPI.xlsx
  return <Dashboard initialWeek="2026-S31" />;
}
