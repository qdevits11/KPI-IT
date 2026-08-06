import { Suspense } from "react";
import { HomeDashboard } from "@/components/HomeDashboard";
import { currentWeekId } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Accueil — tableau de bord unifié (semaine courante ou historique figé). */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const week =
    params.week && /^\d{4}-S\d{2}$/.test(params.week)
      ? params.week
      : currentWeekId();
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
