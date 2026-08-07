"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { TicketStatDimension, TicketStatsPayload } from "@/lib/types";
import { StatsEvolutionChart } from "./StatsEvolutionChart";
import {
  ClickableCount,
  TicketDrilldown,
  type DrilldownQuery,
} from "./TicketDrilldown";
import { PersonLabel } from "./PersonAvatar";
import { usePeopleAvatars } from "./PeopleProvider";
import { AnalysePeriodFilter } from "./AnalysePeriodFilter";
import { ExportXlsxButton } from "./ExportXlsxButton";
import {
  downloadXlsxSheet,
  type SheetData,
  type SheetRow,
} from "@/lib/export-xlsx";
import { weekRangeQuery, type WeekRange } from "@/lib/week-range";

interface StatsResponse {
  year: number;
  years: number[];
  weekFrom?: number | null;
  weekTo?: number | null;
  stats: TicketStatsPayload;
}

type ViewMode = "ranking" | "matrix" | "chart";

const VIEW_OPTIONS: Array<{ id: ViewMode; label: string }> = [
  { id: "ranking", label: "Classement" },
  { id: "chart", label: "Graphique" },
  { id: "matrix", label: "Matrice" },
];

function weekLabel(weekKey: string): string {
  const m = weekKey.match(/S(\d{2})$/);
  return m ? `S${m[1]}` : weekKey;
}

function pct(share: number): string {
  return `${(share * 100).toFixed(1)} %`;
}

function dimFilter(
  dimension: TicketStatDimension,
  name: string,
): Pick<DrilldownQuery, "assignee" | "requester" | "type"> {
  if (dimension === "assignee") return { assignee: name };
  if (dimension === "requester") return { requester: name };
  return { type: name };
}

export function TicketStatsView({
  dimension,
  initialYear = 2026,
}: {
  dimension: TicketStatDimension;
  initialYear?: number;
}) {
  const [year, setYear] = useState(initialYear);
  const [weekFrom, setWeekFrom] = useState<number | undefined>();
  const [weekTo, setWeekTo] = useState<number | undefined>();
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("ranking");
  const [drill, setDrill] = useState<DrilldownQuery | null>(null);
  const { avatarUrl } = usePeopleAvatars();
  const showAvatar = dimension === "assignee" || dimension === "requester";

  const load = useCallback(
    async (y: number, range: WeekRange) => {
      setError(null);
      const res = await fetch(
        `/api/stats?year=${encodeURIComponent(String(y))}&dimension=${encodeURIComponent(dimension)}${weekRangeQuery(range)}`,
      );
      if (!res.ok) {
        setError("Impossible de charger les statistiques");
        return;
      }
      setData((await res.json()) as StatsResponse);
    },
    [dimension],
  );

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

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.stats.rows;
    return data.stats.rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [data, query]);

  const maxTotal = useMemo(
    () => Math.max(...filtered.map((r) => r.total), 1),
    [filtered],
  );

  function openPersonYear(name: string) {
    setDrill({
      scope: "created",
      year,
      ...dimFilter(dimension, name),
    });
  }

  function openPersonWeek(name: string, weekId: string) {
    setDrill({
      scope: "created",
      weekId,
      ...dimFilter(dimension, name),
    });
  }

  function openWeekTotal(weekId: string) {
    setDrill({ scope: "created", weekId });
  }

  function openYearTotal() {
    setDrill({ scope: "created", year });
  }

  async function exportExcel() {
    if (!data) return;
    const weeks = data.stats.weeks;
    const header: SheetRow = [
      { value: "Nom", fontWeight: "bold" },
      ...weeks.map((wk) => ({
        value: weekLabel(wk),
        fontWeight: "bold" as const,
      })),
      { value: "Total", fontWeight: "bold" },
      { value: "Part (%)", fontWeight: "bold" },
    ];
    const body: SheetData = filtered.map((row) => [
      row.name,
      ...weeks.map((wk) => row.byWeek[wk] ?? 0),
      row.total,
      Number((row.share * 100).toFixed(1)),
    ]);
    const totals: SheetRow = [
      { value: "Total", fontWeight: "bold" },
      ...weeks.map((wk) => ({
        value: data.stats.weekTotals[wk] ?? 0,
        fontWeight: "bold" as const,
      })),
      { value: data.stats.grandTotal, fontWeight: "bold" },
      { value: 100, fontWeight: "bold" },
    ];
    const rangeSuffix =
      weekFrom || weekTo
        ? `_S${String(weekFrom ?? 1).padStart(2, "0")}-S${String(weekTo ?? 53).padStart(2, "0")}`
        : "";
    const dimLabel =
      dimension === "assignee"
        ? "assigne"
        : dimension === "requester"
          ? "demandeur"
          : "type";
    await downloadXlsxSheet({
      filename: `stats_${dimLabel}_${year}${rangeSuffix}`,
      sheetName: data.stats.label.slice(0, 31),
      data: [header, ...body, totals],
      columnWidths: [24, ...weeks.map(() => 8), 10, 10],
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)] sm:text-3xl">
            {data?.stats.label ?? "Statistiques tickets"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            {data?.stats.description ??
              "Analyse des tickets créés sur la période sélectionnée."}{" "}
            Cliquez un nombre pour lister les tickets Jira.
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
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              Filtrer
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom…"
                className="w-40 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[var(--ink)] sm:w-48"
              />
            </label>
            <div
              role="group"
              aria-label="Mode d’affichage"
              className="flex rounded-md border border-[var(--line)] bg-[var(--surface)] p-0.5"
            >
              {VIEW_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setView(opt.id)}
                  className={`rounded px-2.5 py-1.5 text-sm transition-colors ${
                    view === opt.id
                      ? "bg-[var(--ink)] text-[var(--paper)]"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <ExportXlsxButton
              onExport={exportExcel}
              disabled={!data || filtered.length === 0}
            />
          </div>
        </div>
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
        <>
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                Total période
              </p>
              <p className="mt-0.5 font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
                <ClickableCount
                  value={data.stats.grandTotal}
                  className="text-2xl"
                  onClick={openYearTotal}
                />
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                Entrées
              </p>
              <p className="mt-0.5 font-[family-name:var(--font-display)] text-2xl tabular-nums text-[var(--ink)]">
                {data.stats.rows.length}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                Semaines
              </p>
              <p className="mt-0.5 font-[family-name:var(--font-display)] text-2xl tabular-nums text-[var(--ink)]">
                {data.stats.weeks.length}
              </p>
            </div>
          </div>

          {data.stats.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)]/60 px-4 py-8 text-center text-sm text-[var(--muted)]">
              Aucune donnée pour cette dimension sur la période.
              {dimension === "requester"
                ? " Synchronisez Jira pour peupler les demandeurs (reporter)."
                : " Vérifiez une sync Jira dans Admin → Opérations."}
            </p>
          ) : view === "chart" ? (
            <StatsEvolutionChart
              weeks={data.stats.weeks}
              rows={filtered}
              weekTotals={data.stats.weekTotals}
            />
          ) : view === "matrix" ? (
            <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface)]">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--wash)]/50 text-left text-xs uppercase tracking-[0.1em] text-[var(--muted)]">
                    <th className="sticky left-0 z-10 bg-[var(--wash)] px-3 py-2 font-medium">
                      Nom
                    </th>
                    {data.stats.weeks.map((wk) => (
                      <th
                        key={wk}
                        className="px-2 py-2 text-center font-medium tabular-nums"
                        title={wk}
                      >
                        {weekLabel(wk)}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr
                      key={row.name}
                      className="border-b border-[var(--line)]/60 hover:bg-[var(--wash)]/40"
                    >
                      <td className="sticky left-0 z-10 bg-[var(--surface)] px-3 py-1.5 font-medium text-[var(--ink)]">
                        {showAvatar ? (
                          <PersonLabel
                            name={row.name}
                            avatarUrl={avatarUrl(row.name)}
                            size="xs"
                          />
                        ) : (
                          row.name
                        )}
                      </td>
                      {data.stats.weeks.map((wk) => {
                        const n = row.byWeek[wk] ?? 0;
                        return (
                          <td
                            key={wk}
                            className="px-2 py-1.5 text-center"
                          >
                            {n === 0 ? (
                              <span className="tabular-nums text-[var(--muted)]/50">
                                ·
                              </span>
                            ) : (
                              <ClickableCount
                                value={n}
                                className="text-[var(--ink-soft)]"
                                onClick={() => openPersonWeek(row.name, wk)}
                              />
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 text-right font-medium">
                        <ClickableCount
                          value={row.total}
                          onClick={() => openPersonYear(row.name)}
                        />
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[var(--wash)]/60 font-medium">
                    <td className="sticky left-0 z-10 bg-[var(--wash)] px-3 py-2 text-[var(--ink)]">
                      Total
                    </td>
                    {data.stats.weeks.map((wk) => (
                      <td key={wk} className="px-2 py-2 text-center">
                        <ClickableCount
                          value={data.stats.weekTotals[wk] ?? 0}
                          onClick={() => openWeekTotal(wk)}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <ClickableCount
                        value={data.stats.grandTotal}
                        onClick={openYearTotal}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
              {filtered.map((row, i) => (
                <li
                  key={row.name}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-sm"
                  style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                >
                  <span className="w-6 tabular-nums text-xs text-[var(--muted)]">
                    {i + 1}
                  </span>
                  <div>
                    <div className="flex justify-between gap-2">
                      {showAvatar ? (
                        <PersonLabel
                          name={row.name}
                          avatarUrl={avatarUrl(row.name)}
                          size="sm"
                          className="min-w-0 text-[var(--ink)]"
                        />
                      ) : (
                        <span className="text-[var(--ink)]">{row.name}</span>
                      )}
                      <span className="tabular-nums text-[var(--muted)]">
                        {pct(row.share)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-[var(--wash)]">
                      <div
                        className="h-full rounded bg-[var(--accent)] transition-all duration-500"
                        style={{
                          width: `${(row.total / maxTotal) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <ClickableCount
                    value={row.total}
                    className="min-w-[3rem] text-right font-medium"
                    onClick={() => openPersonYear(row.name)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {drill && (
        <TicketDrilldown query={drill} onClose={() => setDrill(null)} />
      )}
    </div>
  );
}
