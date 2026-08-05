import { Suspense } from "react";
import { Dashboard } from "@/components/Dashboard";
import { currentWeekId } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function SemaineEnCoursPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--muted)]">Chargement…</p>}>
      <Dashboard initialWeek={currentWeekId()} lockToCurrentWeek />
    </Suspense>
  );
}
