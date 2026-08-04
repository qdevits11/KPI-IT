"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { KpiValue, Period, PeriodData } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/formulas";
import { PeriodSelector } from "./PeriodSelector";
import { KpiCard } from "./KpiCard";

interface DashboardPayload {
  period: PeriodData;
  kpis: KpiValue[];
  periods: Period[];
}

const CATEGORY_ORDER = [
  "tickets",
  "appareils",
  "odoo",
  "metier",
  "phishing",
  "production",
] as const;

export function Dashboard({ initialPeriod }: { initialPeriod: string }) {
  const [periodId, setPeriodId] = useState(initialPeriod);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async (id: string) => {
    setError(null);
    const res = await fetch(`/api/kpis?period=${encodeURIComponent(id)}`);
    if (!res.ok) {
      setError("Impossible de charger les KPI");
      return;
    }
    const json = (await res.json()) as DashboardPayload;
    setData(json);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load(periodId);
    });
  }, [periodId, load]);

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    label: CATEGORY_LABELS[cat],
    items: data?.kpis.filter((k) => k.category === cat) ?? [],
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
            Service IT
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--ink)] sm:text-4xl">
            Tableau de bord KPI
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Chiffres calculés à partir de Jira et des saisies manuelles — chaque
            indicateur renvoie à sa formule.
          </p>
        </div>
        {data && (
          <PeriodSelector
            periods={data.periods}
            value={periodId}
            onChange={setPeriodId}
          />
        )}
      </div>

      {error && (
        <p className="rounded-md border border-[var(--crit)]/30 bg-[var(--crit)]/10 px-3 py-2 text-sm text-[var(--crit)]">
          {error}
        </p>
      )}

      {pending && !data && (
        <p className="text-sm text-[var(--muted)]">Chargement…</p>
      )}

      {grouped.map((group) => (
        <section key={group.cat} className="space-y-4">
          <div className="flex items-baseline justify-between border-b border-[var(--line)] pb-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
              {group.label}
            </h2>
            <span className="text-xs text-[var(--muted)]">
              {group.items[0]?.source === "jira"
                ? "Source : Jira"
                : "Source : saisie manuelle"}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((kpi) => (
              <KpiCard key={kpi.id} kpi={kpi} />
            ))}
          </div>
        </section>
      ))}

      {data?.period.jira.lastSyncedAt && (
        <p className="text-xs text-[var(--muted)]">
          Dernière sync Jira :{" "}
          {new Date(data.period.jira.lastSyncedAt).toLocaleString("fr-BE")}
        </p>
      )}
    </div>
  );
}
