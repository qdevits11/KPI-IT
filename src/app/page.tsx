import { Suspense } from "react";
import { HomeDashboard } from "@/components/HomeDashboard";
import { clampWeekIdToCurrent } from "@/lib/dates";

export const dynamic = "force-dynamic";

/** Accueil — tableau de bord unifié (semaine courante ou historique figé). */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const week = clampWeekIdToCurrent(params.week);
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-[var(--muted)]">Chargement…</p>
      }
    >
      <HomeDashboard initialWeek={week} />
    </Suspense>
  );
}
