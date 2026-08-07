"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { KpiValue, LogEvent, PhishingEvent, WeeklyRow } from "@/lib/types";
import { clampWeekIdToCurrent } from "@/lib/dates";
import { CATEGORY_LABELS } from "@/lib/formulas";
import { WeekSelector } from "./WeekSelector";
import { KpiCard } from "./KpiCard";
import {
  ClickableCount,
  TicketDrilldown,
  type DrilldownQuery,
} from "./TicketDrilldown";
import { PersonLabel } from "./PersonAvatar";
import { usePeopleAvatars } from "./PeopleProvider";
import type { TicketStatDimension } from "@/lib/types";

interface WeekOption {
  id: string;
  label: string;
  isCurrent?: boolean;
}

interface WeekMeta {
  currentWeekId: string;
  isCurrentWeek: boolean;
  isCompleted: boolean;
  isLive: boolean;
  openFrozenAt: string | null;
  jiraSyncedAt: string | null;
  dateRange: {
    start: string;
    endExclusive: string;
    endInclusive: string;
  };
  dateRangeLabel: string;
  brusselsNow: string;
}

interface Payload {
  week: WeeklyRow;
  kpis: KpiValue[];
  weeks: WeekOption[];
  meta: WeekMeta;
  events: {
    automationsMetier: LogEvent[];
    automationsOdoo: LogEvent[];
    phishing: PhishingEvent[];
    maintenances: LogEvent[];
  };
  ticketsByType: Record<string, number>;
  ticketsByAssignee: Record<string, number>;
  ticketsByRequester: Record<string, number>;
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
  dimension,
  weekId,
  onDrill,
}: {
  title: string;
  data: Record<string, number>;
  dimension: TicketStatDimension;
  weekId: string;
  onDrill: (q: DrilldownQuery) => void;
}) {
  const { avatarUrl } = usePeopleAvatars();
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">Pas de ventilation pour cette semaine.</p>
    );
  }
  const max = Math.max(...entries.map(([, v]) => v), 1);
  const showAvatar = dimension === "assignee" || dimension === "requester";

  function filterFor(name: string): DrilldownQuery {
    const base: DrilldownQuery = { scope: "created", weekId };
    if (dimension === "assignee") return { ...base, assignee: name };
    if (dimension === "requester") return { ...base, requester: name };
    return { ...base, type: name };
  }

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
                {showAvatar ? (
                  <PersonLabel
                    name={name}
                    avatarUrl={avatarUrl(name)}
                    size="xs"
                    className="min-w-0 text-[var(--ink-soft)]"
                  />
                ) : (
                  <span className="text-[var(--ink-soft)]">{name}</span>
                )}
                <ClickableCount
                  value={count}
                  onClick={() => onDrill(filterFor(name))}
                />
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

function formatSyncedAt(iso: string | null): string {
  if (!iso) return "jamais";
  try {
    return new Date(iso).toLocaleString("fr-BE", {
      timeZone: "Europe/Brussels",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Sync complète depuis la page Semaine en cours (KPI + non résolus + ventilations). */
const CURRENT_WEEK_SYNC_FIELDS = {
  demandesItHebdo: true,
  demandesClotureesHebdo: true,
  demandesNonResoluesHebdo: true,
  ticketsHorsSlaCloture: true,
  ticketsHorsSlaPriseEnCharge: true,
  ticketsByType: true,
  ticketsByAssignee: true,
  ticketsByRequester: true,
} as const;

function CurrentWeekStatus({
  data,
  onRefresh,
  pending,
  syncMessage,
}: {
  data: Payload;
  onRefresh: () => void;
  pending: boolean;
  syncMessage: string | null;
}) {
  const { week, meta, kpis } = data;
  const val = (id: string) => kpis.find((k) => k.id === id)?.value ?? null;
  const highlight = [
    { id: "demandes_it_hebdo", label: "Demandes IT" },
    { id: "demandes_non_resolues_hebdo", label: "Non résolues" },
    { id: "hors_sla_cloture", label: "Hors SLA clôture" },
    { id: "hors_sla_prise_en_charge", label: "Hors SLA prise en charge" },
  ] as const;

  let statusLabel = "Semaine passée";
  let statusHint = "Indicateurs figés pour cette semaine.";
  let statusClass =
    "border-[var(--line)] bg-[var(--wash)] text-[var(--ink-soft)]";

  if (meta.isLive) {
    statusLabel = "En cours · live";
    statusHint =
      "Actualiser relance une sync Jira complète (créés, non résolus, SLA, ventilations). Figement dimanche 23:59 Bruxelles.";
    statusClass =
      "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent-deep)]";
  } else if (meta.isCurrentWeek && meta.openFrozenAt) {
    statusLabel = "En cours · figée";
    statusHint = `Non-résolus figés le ${formatSyncedAt(meta.openFrozenAt)}.`;
    statusClass =
      "border-[var(--warn)]/40 bg-[var(--warn)]/10 text-[var(--ink)]";
  } else if (meta.isCompleted && meta.openFrozenAt) {
    statusLabel = "Terminée · figée";
    statusHint = `Snapshot du ${formatSyncedAt(meta.openFrozenAt)}.`;
  }

  return (
    <section className="space-y-5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
            État de la semaine
          </p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--ink)] sm:text-3xl">
            S{String(week.week).padStart(2, "0")} — {week.year}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">{meta.dateRangeLabel}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Bruxelles · {meta.brusselsNow}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span
            className={`rounded-md border px-2.5 py-1 text-xs font-medium uppercase tracking-[0.12em] ${statusClass}`}
          >
            {statusLabel}
          </span>
          <p className="max-w-xs text-right text-xs text-[var(--muted)]">
            {statusHint}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {highlight.map((h) => {
          const v = val(h.id);
          return (
            <div
              key={h.id}
              className="border-t border-[var(--line)] pt-3 sm:border-t-0 sm:border-l sm:pl-4 sm:pt-0 first:border-l-0 first:pl-0"
            >
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                {h.label}
              </p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl tabular-nums text-[var(--ink)]">
                {v === null ? "—" : v.toLocaleString("fr-BE")}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-[var(--muted)]">
            Dernière sync Jira :{" "}
            <span className="text-[var(--ink-soft)]">
              {formatSyncedAt(meta.jiraSyncedAt)}
            </span>
          </p>
          {syncMessage && (
            <p className="text-sm text-[var(--ok)]">{syncMessage}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={pending}
          className="rounded-md bg-[var(--ink)] px-3 py-1.5 text-sm text-[var(--paper)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Sync Jira…" : "Actualiser"}
        </button>
      </div>
    </section>
  );
}

export function Dashboard({
  initialWeek,
}: {
  initialWeek: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const weekFromUrl = searchParams.get("week");
  const weekId = clampWeekIdToCurrent(weekFromUrl ?? initialWeek);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [drill, setDrill] = useState<DrilldownQuery | null>(null);

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

  function selectWeek(id: string) {
    router.replace(`/semaine?week=${encodeURIComponent(id)}`, { scroll: false });
  }

  function refreshFromJira() {
    setSyncMessage(null);
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/jira/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekId,
          dryRun: false,
          forceOpenLive: true,
          saveFields: CURRENT_WEEK_SYNC_FIELDS,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        savedFields?: string[];
        values?: {
          demandesItHebdo?: number;
          demandesNonResoluesHebdo?: number;
        };
      };
      if (!res.ok || !json.ok) {
        setError(
          json.error ??
            "Sync Jira impossible — configurez le compte dans Admin → Intégration Jira.",
        );
        return;
      }
      const saved = json.savedFields?.length
        ? json.savedFields.join(", ")
        : "KPI Jira";
      const open =
        json.values?.demandesNonResoluesHebdo != null
          ? ` · non résolus = ${json.values.demandesNonResoluesHebdo}`
          : "";
      setSyncMessage(`Sync OK — ${saved}${open}`);
      await load(weekId);
    });
  }

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
            Semaine
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            KPI hebdomadaires : tickets Jira, stock non résolu, encodages manuels
            et cumuls YTD.
          </p>
        </div>
        {data && (
          <WeekSelector
            weeks={data.weeks}
            value={weekId}
            onChange={selectWeek}
            currentWeekId={data.meta?.currentWeekId}
          />
        )}
      </div>

      {data?.meta?.isCurrentWeek && (
        <CurrentWeekStatus
          data={data}
          onRefresh={refreshFromJira}
          pending={pending}
          syncMessage={syncMessage}
        />
      )}

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
            <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-3">
              <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
                Retour sur la semaine
              </h2>
              {data.week.informations && (
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                    Fluctuation des chiffres
                  </p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)] whitespace-pre-wrap">
                    {data.week.informations}
                  </p>
                </div>
              )}
              {data.week.reaction && (
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                    Recommandations
                  </p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)] whitespace-pre-wrap">
                    {data.week.reaction}
                  </p>
                </div>
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
              {data.events.automationsMetier.length === 0 &&
                data.events.automationsOdoo.length === 0 &&
                data.events.maintenances.length === 0 &&
                data.events.phishing.length === 0 && (
                  <p className="text-sm text-[var(--muted)]">
                    Aucun événement encodé pour cette semaine.{" "}
                    <Link href="/" className="text-[var(--accent-deep)] hover:underline">
                      Encoder →
                    </Link>
                  </p>
                )}
            </div>
            <div className="space-y-8 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                  Ventilation hebdo
                </p>
                <Link
                  href="/analyse/tickets"
                  className="text-xs font-medium text-[var(--accent-deep)] hover:text-[var(--accent)]"
                >
                  Stats annuelles →
                </Link>
              </div>
              <Breakdown
                title="Tickets par type"
                data={data.ticketsByType}
                dimension="type"
                weekId={weekId}
                onDrill={setDrill}
              />
              <Breakdown
                title="Tickets par assigné (Jira)"
                data={data.ticketsByAssignee}
                dimension="assignee"
                weekId={weekId}
                onDrill={setDrill}
              />
              <Breakdown
                title="Tickets par demandeur"
                data={data.ticketsByRequester ?? {}}
                dimension="requester"
                weekId={weekId}
                onDrill={setDrill}
              />
            </div>
          </section>
        </>
      )}

      {drill && (
        <TicketDrilldown query={drill} onClose={() => setDrill(null)} />
      )}
    </div>
  );
}
