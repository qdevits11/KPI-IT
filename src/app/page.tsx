import { Suspense } from "react";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const week =
    params.week && /^\d{4}-S\d{2}$/.test(params.week)
      ? params.week
      : "2026-S31";
  return (
    <Suspense fallback={<p className="text-sm text-[var(--muted)]">Chargement…</p>}>
      <Dashboard initialWeek={week} />
    </Suspense>
  );
}
