"use client";

import { useId, useMemo, useState } from "react";
import type { TicketStatRow } from "@/lib/types";

const PALETTE = [
  "#0f766e",
  "#1d4ed8",
  "#b45309",
  "#be123c",
  "#0e7490",
  "#4d7c0f",
  "#c2410c",
  "#6d28d9",
  "#0369a1",
  "#a16207",
];

const TOTAL_COLOR = "#132033";

function weekLabel(weekKey: string): string {
  const m = weekKey.match(/S(\d{2})$/);
  return m ? `S${m[1]}` : weekKey;
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const f = value / 10 ** exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

export function StatsEvolutionChart({
  weeks,
  rows,
  weekTotals,
  topN = 6,
}: {
  weeks: string[];
  rows: TicketStatRow[];
  weekTotals: Record<string, number>;
  topN?: number;
}) {
  const gradId = useId().replace(/:/g, "");
  const series = useMemo(() => rows.slice(0, topN), [rows, topN]);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [showTotal, setShowTotal] = useState(true);
  const [hover, setHover] = useState<number | null>(null);

  const visibleSeries = useMemo(
    () => series.filter((s) => !hidden.has(s.name)),
    [series, hidden],
  );

  const maxY = useMemo(() => {
    let m = 0;
    for (const wk of weeks) {
      if (showTotal) m = Math.max(m, weekTotals[wk] ?? 0);
      for (const s of visibleSeries) {
        m = Math.max(m, s.byWeek[wk] ?? 0);
      }
    }
    return niceMax(m);
  }, [weeks, weekTotals, visibleSeries, showTotal]);

  const W = 720;
  const H = 320;
  const pad = { top: 20, right: 16, bottom: 36, left: 40 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const xAt = (i: number) =>
    pad.left + (weeks.length <= 1 ? innerW / 2 : (i / (weeks.length - 1)) * innerW);
  const yAt = (v: number) => pad.top + innerH - (v / maxY) * innerH;

  function pathFor(values: number[]): string {
    return values
      .map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)
      .join(" ");
  }

  const yTicks = useMemo(() => {
    const steps = 4;
    return Array.from({ length: steps + 1 }, (_, i) =>
      Math.round((maxY * i) / steps),
    );
  }, [maxY]);

  const xLabelStep = Math.max(1, Math.ceil(weeks.length / 12));

  function toggle(name: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const hoverWeek = hover != null ? weeks[hover] : null;

  return (
    <div className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--muted)]">
          Évolution hebdomadaire — top {Math.min(topN, rows.length)}
          {rows.length > topN ? ` / ${rows.length}` : ""}
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ink-soft)]">
          <input
            type="checkbox"
            checked={showTotal}
            onChange={(e) => setShowTotal(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Total semaine
        </label>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[520px]"
          role="img"
          aria-label="Graphique d’évolution des tickets par semaine"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`area-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TOTAL_COLOR} stopOpacity="0.12" />
              <stop offset="100%" stopColor={TOTAL_COLOR} stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={W - pad.right}
                y1={yAt(t)}
                y2={yAt(t)}
                stroke="var(--line)"
                strokeWidth={1}
              />
              <text
                x={pad.left - 8}
                y={yAt(t) + 4}
                textAnchor="end"
                className="fill-[var(--muted)]"
                fontSize={11}
              >
                {t}
              </text>
            </g>
          ))}

          {weeks.map((wk, i) =>
            i % xLabelStep === 0 || i === weeks.length - 1 ? (
              <text
                key={wk}
                x={xAt(i)}
                y={H - 10}
                textAnchor="middle"
                className="fill-[var(--muted)]"
                fontSize={11}
              >
                {weekLabel(wk)}
              </text>
            ) : null,
          )}

          {showTotal && weeks.length > 0 && (
            <>
              <path
                d={`${pathFor(weeks.map((wk) => weekTotals[wk] ?? 0))} L${xAt(weeks.length - 1).toFixed(1)},${yAt(0).toFixed(1)} L${xAt(0).toFixed(1)},${yAt(0).toFixed(1)} Z`}
                fill={`url(#area-${gradId})`}
              />
              <path
                d={pathFor(weeks.map((wk) => weekTotals[wk] ?? 0))}
                fill="none"
                stroke={TOTAL_COLOR}
                strokeWidth={2}
                strokeDasharray="5 4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          )}

          {visibleSeries.map((s) => {
            const color = PALETTE[series.indexOf(s) % PALETTE.length];
            const values = weeks.map((wk) => s.byWeek[wk] ?? 0);
            return (
              <path
                key={s.name}
                d={pathFor(values)}
                fill="none"
                stroke={color}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
                className="transition-[stroke-opacity] duration-200"
              />
            );
          })}

          {weeks.map((_, i) => {
            const left =
              i === 0 ? pad.left : (xAt(i) + xAt(i - 1)) / 2;
            const right =
              i === weeks.length - 1
                ? pad.left + innerW
                : (xAt(i) + xAt(i + 1)) / 2;
            return (
              <rect
                key={weeks[i]}
                x={left}
                y={pad.top}
                width={Math.max(right - left, 1)}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            );
          })}

          {hover != null && (
            <g>
              <line
                x1={xAt(hover)}
                x2={xAt(hover)}
                y1={pad.top}
                y2={pad.top + innerH}
                stroke="var(--ink)"
                strokeOpacity={0.25}
                strokeWidth={1}
              />
              {showTotal && (
                <circle
                  cx={xAt(hover)}
                  cy={yAt(weekTotals[weeks[hover]] ?? 0)}
                  r={3.5}
                  fill={TOTAL_COLOR}
                />
              )}
              {visibleSeries.map((s) => {
                const color = PALETTE[series.indexOf(s) % PALETTE.length];
                return (
                  <circle
                    key={s.name}
                    cx={xAt(hover)}
                    cy={yAt(s.byWeek[weeks[hover]] ?? 0)}
                    r={3.5}
                    fill={color}
                  />
                );
              })}
            </g>
          )}
        </svg>
      </div>

      {hoverWeek && hover != null && (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--wash)]/60 px-3 py-2 text-sm">
          <p className="mb-1.5 font-medium text-[var(--ink)]">
            {weekLabel(hoverWeek)}{" "}
            <span className="font-normal text-[var(--muted)]">({hoverWeek})</span>
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {showTotal && (
              <li className="flex justify-between gap-3 tabular-nums">
                <span className="text-[var(--ink-soft)]">Total</span>
                <span className="font-medium text-[var(--ink)]">
                  {weekTotals[hoverWeek] ?? 0}
                </span>
              </li>
            )}
            {visibleSeries.map((s) => (
              <li
                key={s.name}
                className="flex justify-between gap-3 tabular-nums"
              >
                <span className="flex min-w-0 items-center gap-2 truncate text-[var(--ink-soft)]">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{
                      background: PALETTE[series.indexOf(s) % PALETTE.length],
                    }}
                  />
                  {s.name}
                </span>
                <span className="font-medium text-[var(--ink)]">
                  {s.byWeek[hoverWeek] ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="flex flex-wrap gap-2">
        {series.map((s, i) => {
          const on = !hidden.has(s.name);
          return (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => toggle(s.name)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  on
                    ? "border-[var(--line)] bg-[var(--paper)] text-[var(--ink)]"
                    : "border-transparent bg-transparent text-[var(--muted)] line-through opacity-60"
                }`}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: on ? PALETTE[i % PALETTE.length] : "#94a3b8" }}
                />
                {s.name}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
