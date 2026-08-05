"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { KpiValue, LogEvent, PhishingEvent, WeeklyRow } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/formulas";
import { WeekSelector } from "./WeekSelector";
import { KpiCard } from "./KpiCard";

interface WeekOption {
  id: string;
  label: string;
}

interface Payload {
  week: WeeklyRow;
  kpis: KpiValue[];
  weeks: WeekOption[];
  events: {
    automationsMetier: LogEvent[];
    automationsOdoo: LogEvent[];
    phishing: PhishingEvent[];
    maintenances: LogEvent[];
  };
  ticketsByType: Record<string, number>;
  ticketsByAssignee: Record<string, number>;
}

const CATEGORY_ORDER = [
  "sla",
  "metier",
  "odoo",
  "phishing",
  "production",
  "ticketing",
] as const;

function Breakdown({
  title,
  data,
}: {
  title: string;
  data: Record<string, number>;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">Pas de ventilation pour cette semaine.</p>
    );
  }
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div className="space-y-2">
      <h3 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
        {title}
      </h3>
      <ul className="space-y-1.5">
        {entries.map(([name, count]) => (
          <li key={name} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
            <div>
              <div className="flex justify-between gap-2">
                <span className="text-[var(--ink-soft)]">{name}</span>
                <span className="tabular-nums text-[var(--ink)]">{count}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-[var(--wash)]">
                <div
                  className="h-full rounded bg-[var(--accent)] transition-all duration-500"
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EventList({ title, items }: { title: string; items: LogEvent[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-[var(--ink)]">{title}</h3>
      <ul className="space-y-1 text-sm text-[var(--ink-soft)]">
        {items.map((e) => (
          <li key={e.id} className="border-l-2 border-[var(--accent)] pl-3">
            {e.date && (
              <span className="mr-1 tabular-nums text-xs text-[var(--muted)]">
                {e.date.slice(8, 10)}/{e.date.slice(5, 7)}
              </span>
            )}
            {e.explanation}{" "}
            <span className="text-xs text-[var(--muted)]">— {e.responsible}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Dashboard({ initialWeek }: { initialWeek: string }) {
  const [weekId, setWeekId] = useState(initialWeek);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async (id: string) => {
    setError(null);
    const res = await fetch(`/api/kpis?week=${encodeURIComponent(id)}`);
    if (!res.ok) {
      setError("Impossible de charger les KPI");
      return;
    }
    setData((await res.json()) as Payload);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load(weekId);
    });
  }, [weekId, load]);

  // Prefer a week with data when landing on empty future week
  useEffect(() => {
    if (!data) return;
    if (
      data.week.demandesItHebdo == null &&
      data.weeks.some((w) => w.id === "2026-S31")
    ) {
      // keep current; user can pick
    }
  }, [data]);

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
            Service IT — Becoflex / Coverseal
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--ink)] sm:text-4xl">
            KPI hebdomadaires
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Chiffres calculés comme dans KPI.xlsx : COUNTIFS / SUMIFS / YTD sur
            les journaux et le ticketing.
          </p>
        </div>
        {data && (
          <WeekSelector weeks={data.weeks} value={weekId} onChange={setWeekId} />
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
          <h2 className="border-b border-[var(--line)] pb-2 font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            {group.label}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((kpi) => (
              <KpiCard key={kpi.id} kpi={kpi} />
            ))}
          </div>
        </section>
      ))}

      {data && (
        <>
          {(data.week.informations || data.week.reaction) && (
            <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-2">
              <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
                Remarques
              </h2>
              {data.week.informations && (
                <p className="text-sm text-[var(--ink-soft)]">
                  <span className="text-[var(--muted)]">Infos : </span>
                  {data.week.informations}
                </p>
              )}
              {data.week.reaction && (
                <p className="text-sm text-[var(--ink-soft)]">
                  <span className="text-[var(--muted)]">Réaction : </span>
                  {data.week.reaction}
                </p>
              )}
            </section>
          )}

          <section className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
              <EventList
                title="Automatisations métiers"
                items={data.events.automationsMetier}
              />
              <EventList
                title="Améliorations Odoo"
                items={data.events.automationsOdoo}
              />
              <EventList
                title="Maintenances production"
                items={data.events.maintenances}
              />
              {data.events.phishing.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-[var(--ink)]">
                    Tests phishing ratés
                  </h3>
                  <ul className="space-y-1 text-sm">
                    {data.events.phishing.map((e) => (
                      <li key={e.id} className="border-l-2 border-[var(--accent)] pl-3">
                        {e.date && (
                          <span className="mr-1 tabular-nums text-xs text-[var(--muted)]">
                            {e.date.slice(8, 10)}/{e.date.slice(5, 7)}
                          </span>
                        )}
                        {e.failures} échec{e.failures > 1 ? "s" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="space-y-8 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
              <Breakdown title="Tickets par type" data={data.ticketsByType} />
              <Breakdown
                title="Tickets par responsable"
                data={data.ticketsByAssignee}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
