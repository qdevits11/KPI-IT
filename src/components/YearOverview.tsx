"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { YearOverviewRow } from "@/lib/types";
import { AnalysePeriodFilter } from "./AnalysePeriodFilter";
import { weekRangeQuery, type WeekRange } from "@/lib/week-range";

type ColumnGroup =
  | "sla"
  | "metier"
  | "odoo"
  | "phishing"
  | "production"
  | "ticketing"
  | "remarques";

const GROUPS: Array<{ id: ColumnGroup; label: string }> = [
  { id: "sla", label: "SLA" },
  { id: "metier", label: "Métier" },
  { id: "odoo", label: "Odoo" },
  { id: "phishing", label: "Phishing" },
  { id: "production", label: "Maintenance" },
  { id: "ticketing", label: "Ticketing" },
  { id: "remarques", label: "Remarques" },
];

type ColKey = keyof YearOverviewRow;

const COLUMNS: Array<{
  key: ColKey;
  label: string;
  short: string;
  group: ColumnGroup;
  numeric?: boolean;
}> = [
  { key: "horsSlaCloture", label: "Hors SLA clôture", short: "SLA clôt.", group: "sla", numeric: true },
  { key: "horsSlaPriseEnCharge", label: "Hors SLA prise en charge", short: "SLA PEC", group: "sla", numeric: true },
  { key: "automationsMetier", label: "Automatisations métiers", short: "Métier", group: "metier", numeric: true },
  { key: "ameliorationsOdoo", label: "Améliorations Odoo", short: "Odoo", group: "odoo", numeric: true },
  { key: "echecsPhishing", label: "Échecs phishing", short: "Phishing", group: "phishing", numeric: true },
  { key: "maintenances", label: "Maintenances prod", short: "Maint.", group: "production", numeric: true },
  { key: "demandesItHebdo", label: "Demandes IT hebdo", short: "IT hebdo", group: "ticketing", numeric: true },
  { key: "demandesItYtd", label: "Demandes IT YTD", short: "IT YTD", group: "ticketing", numeric: true },
  { key: "nonResoluesHebdo", label: "Non résolues hebdo", short: "Open hebdo", group: "ticketing", numeric: true },
  { key: "nonResoluesYtd", label: "Non résolues YTD", short: "Open YTD", group: "ticketing", numeric: true },
  { key: "fluctuation", label: "Fluctuation des chiffres", short: "Fluctuation", group: "remarques" },
  { key: "recommandations", label: "Recommandations", short: "Reco.", group: "remarques" },
];

interface OverviewPayload {
  year: number;
  years: number[];
  rows: YearOverviewRow[];
  totals: {
    automationsMetier: number;
    ameliorationsOdoo: number;
    echecsPhishing: number;
    maintenances: number;
    demandesItHebdo: number;
  };
}

function cell(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString("fr-BE");
  return String(value);
}

export function YearOverview({ initialYear }: { initialYear: number }) {
  const [year, setYear] = useState(initialYear);
  const [weekFrom, setWeekFrom] = useState<number | undefined>();
  const [weekTo, setWeekTo] = useState<number | undefined>();
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeGroups, setActiveGroups] = useState<Set<ColumnGroup>>(
    () => new Set(GROUPS.map((g) => g.id)),
  );
  const [onlyWithRemarks, setOnlyWithRemarks] = useState(false);

  const load = useCallback(async (y: number, range: WeekRange) => {
    setError(null);
    const res = await fetch(
      `/api/overview?year=${encodeURIComponent(String(y))}${weekRangeQuery(range)}`,
    );
    if (!res.ok) {
      setError("Impossible de charger la vue annuelle");
      return;
    }
    setData((await res.json()) as OverviewPayload);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load(year, { weekFrom, weekTo });
    });
  }, [year, weekFrom, weekTo, load]);

  function handleYearChange(next: number) {
    setYear(next);
    setWeekFrom(undefined);
    setWeekTo(undefined);
  }

  function handleRangeChange(range: WeekRange) {
    setWeekFrom(range.weekFrom);
    setWeekTo(range.weekTo);
  }

  const visibleCols = useMemo(
    () => COLUMNS.filter((c) => activeGroups.has(c.group)),
    [activeGroups],
  );

  const rows = useMemo(() => {
    if (!data) return [];
    if (!onlyWithRemarks) return data.rows;
    return data.rows.filter(
      (r) => r.fluctuation.trim() || r.recommandations.trim(),
    );
  }, [data, onlyWithRemarks]);

  function toggleGroup(id: ColumnGroup) {
    setActiveGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
            Vue d&apos;ensemble
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--ink)] sm:text-4xl">
            Chiffres {year}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Une ligne par semaine, filtrable par année et plage de semaines —
            indicateurs et retours (fluctuation + recommandations).
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <AnalysePeriodFilter
            year={year}
            years={data?.years ?? [year]}
            weekFrom={weekFrom}
            weekTo={weekTo}
            onYearChange={handleYearChange}
            onRangeChange={handleRangeChange}
          />
          <label className="flex items-center gap-2 text-sm text-[var(--ink-soft)]">
            <input
              type="checkbox"
              checked={onlyWithRemarks}
              onChange={(e) => setOnlyWithRemarks(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Avec remarques seulement
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {GROUPS.map((g) => {
          const on = activeGroups.has(g.id);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggleGroup(g.id)}
              aria-pressed={on}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                on
                  ? "bg-[var(--ink)] text-[var(--paper)]"
                  : "border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Demandes IT" value={data.totals.demandesItHebdo} />
          <Stat label="Automations métier" value={data.totals.automationsMetier} />
          <Stat label="Odoo" value={data.totals.ameliorationsOdoo} />
          <Stat label="Maintenances" value={data.totals.maintenances} />
          <Stat label="Échecs phishing" value={data.totals.echecsPhishing} />
        </div>
      )}

      {error && (
        <p className="rounded-md border border-[var(--crit)]/30 bg-[var(--crit)]/10 px-3 py-2 text-sm text-[var(--crit)]">
          {error}
        </p>
      )}
      {pending && !data && (
        <p className="text-sm text-[var(--muted)]">Chargement…</p>
      )}

      {data && (
        <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-sm">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--wash)]/80">
                <th className="sticky left-0 z-10 bg-[var(--wash)] px-3 py-2.5 font-medium text-[var(--muted)]">
                  Sem.
                </th>
                <th className="px-3 py-2.5 font-medium text-[var(--muted)]">
                  Mois
                </th>
                {visibleCols.map((c) => (
                  <th
                    key={c.key}
                    title={c.label}
                    className={`px-3 py-2.5 font-medium text-[var(--muted)] ${
                      c.numeric ? "text-right tabular-nums" : "min-w-[10rem]"
                    }`}
                  >
                    {c.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={2 + visibleCols.length}
                    className="px-3 py-6 text-center text-[var(--muted)]"
                  >
                    Aucune semaine à afficher
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const hasRemark =
                  Boolean(row.fluctuation.trim()) ||
                  Boolean(row.recommandations.trim());
                return (
                  <tr
                    key={row.weekKey}
                    className={`border-b border-[var(--line)]/70 transition-colors hover:bg-[var(--wash)]/50 ${
                      hasRemark ? "bg-teal-50/40" : ""
                    }`}
                  >
                    <td className="sticky left-0 z-10 bg-[var(--surface)] px-3 py-2 font-medium text-[var(--ink)]">
                      <Link
                        href={`/?week=${row.weekKey}`}
                        className="text-[var(--accent)] hover:underline"
                      >
                        S{String(row.week).padStart(2, "0")}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-[var(--ink-soft)]">
                      {row.month}
                    </td>
                    {visibleCols.map((c) => {
                      const v = row[c.key];
                      return (
                        <td
                          key={c.key}
                          className={`px-3 py-2 text-[var(--ink-soft)] ${
                            c.numeric
                              ? "text-right tabular-nums text-[var(--ink)]"
                              : "max-w-[16rem] truncate"
                          }`}
                          title={
                            typeof v === "string" && v.length > 40 ? v : undefined
                          }
                        >
                          {cell(v as number | string | null)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[var(--muted)]">
        Cliquez une semaine pour ouvrir le détail KPI. Les lignes teintées ont
        un retour (fluctuation / recommandations).
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-2xl tabular-nums text-[var(--ink)]">
        {value.toLocaleString("fr-BE")}
      </p>
      <p className="text-[11px] text-[var(--muted)]">total année</p>
    </div>
  );
}
