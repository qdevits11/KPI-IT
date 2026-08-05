"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { TicketStatDimension } from "@/lib/types";

interface OverviewBlock {
  dimension: TicketStatDimension;
  label: string;
  href: string;
  description: string;
  grandTotal: number;
  top: Array<{ name: string; total: number; share: number }>;
}

interface OverviewResponse {
  year: number;
  years: number[];
  overview: OverviewBlock[];
}

function pct(share: number): string {
  return `${(share * 100).toFixed(0)} %`;
}

export function StatsOverview({ initialYear = 2026 }: { initialYear?: number }) {
  const [year, setYear] = useState(initialYear);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async (y: number) => {
    setError(null);
    const res = await fetch(`/api/stats?year=${encodeURIComponent(String(y))}`);
    if (!res.ok) {
      setError("Impossible de charger le résumé statistiques");
      return;
    }
    setData((await res.json()) as OverviewResponse);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load(year);
    });
  }, [year, load]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
            Analyse tickets
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--ink)] sm:text-4xl">
            Statistiques
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Volumes annuels par responsable, demandeur et type de demande —
            issus du seed Excel et des syncs Jira.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          Année
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[var(--ink)]"
          >
            {(data?.years ?? [year]).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="rounded-md border border-[var(--crit)]/30 bg-[var(--crit)]/10 px-3 py-2 text-sm text-[var(--crit)]">
          {error}
        </p>
      )}
      {pending && !data && (
        <p className="text-sm text-[var(--muted)]">Chargement…</p>
      )}

      {data && (
        <div className="grid gap-5 lg:grid-cols-3">
          {data.overview.map((block) => (
            <section
              key={block.dimension}
              className="flex flex-col rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(19,32,51,0.25)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
                    {block.label}
                  </h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {block.description}
                  </p>
                </div>
                <p className="font-[family-name:var(--font-display)] text-2xl tabular-nums text-[var(--accent)]">
                  {block.grandTotal.toLocaleString("fr-BE")}
                </p>
              </div>

              {block.top.length === 0 ? (
                <p className="mt-6 flex-1 text-sm text-[var(--muted)]">
                  Pas encore de données
                  {block.dimension === "requester"
                    ? " — sync Jira requise."
                    : "."}
                </p>
              ) : (
                <ol className="mt-5 flex-1 space-y-2.5">
                  {block.top.map((row, i) => (
                    <li
                      key={row.name}
                      className="flex items-baseline justify-between gap-2 text-sm"
                    >
                      <span className="min-w-0 truncate text-[var(--ink-soft)]">
                        <span className="mr-2 tabular-nums text-xs text-[var(--muted)]">
                          {i + 1}.
                        </span>
                        {row.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-[var(--ink)]">
                        {row.total}
                        <span className="ml-1.5 text-xs text-[var(--muted)]">
                          {pct(row.share)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}

              <Link
                href={block.href}
                className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-[var(--accent-deep)] transition-colors hover:text-[var(--accent)]"
              >
                Voir le détail
                <span aria-hidden>→</span>
              </Link>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
