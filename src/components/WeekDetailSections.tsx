"use client";

import Link from "next/link";
import type { KpiValue, LogEvent, PhishingEvent } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/formulas";
import type { TicketStatDimension } from "@/lib/types";
import { KpiCard } from "./KpiCard";
import {
  ClickableCount,
  TicketDrilldown,
  type DrilldownQuery,
} from "./TicketDrilldown";
import { PersonLabel } from "./PersonAvatar";
import { usePeopleAvatars } from "./PeopleProvider";

const CATEGORY_ORDER = [
  "sla",
  "metier",
  "odoo",
  "phishing",
  "production",
  "ticketing",
] as const;

export function WeekStatusBadge({
  isLive,
  isCurrentWeek,
  isCompleted,
  openFrozenAt,
}: {
  isLive: boolean;
  isCurrentWeek: boolean;
  isCompleted: boolean;
  openFrozenAt: string | null;
}) {
  let label = "Semaine passée";
  let hint = "Chiffres arrêtés pour cette semaine.";
  let className =
    "border-[var(--line)] bg-[var(--wash)] text-[var(--ink-soft)]";

  if (isLive) {
    label = "En cours · live";
    hint = "Stock et indicateurs actualisables depuis Jira.";
    className =
      "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent-deep)]";
  } else if (isCurrentWeek && openFrozenAt) {
    label = "En cours · figée";
    hint = "Stock non résolus figé en fin de semaine.";
    className = "border-[var(--warn)]/40 bg-[var(--warn)]/10 text-[var(--ink)]";
  } else if (isCompleted && openFrozenAt) {
    label = "Terminée · figée";
    hint = "Données conservées au snapshot de fin de semaine.";
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <span
        className={`rounded-md border px-2.5 py-1 text-xs font-medium uppercase tracking-[0.12em] ${className}`}
      >
        {label}
      </span>
      <p className="max-w-xs text-xs text-[var(--muted)] sm:text-right">
        {hint}
      </p>
    </div>
  );
}

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
      <p className="text-sm text-[var(--muted)]">
        Pas de ventilation pour cette semaine.
      </p>
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
          <li
            key={name}
            className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm"
          >
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

export function WeekKpiGrid({ kpis }: { kpis: KpiValue[] }) {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    label: CATEGORY_LABELS[cat],
    items: kpis.filter((k) => k.category === cat),
  })).filter((g) => g.items.length > 0);

  if (grouped.length === 0) return null;

  return (
    <>
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
    </>
  );
}

export function WeekNotesSection({
  informations,
  reaction,
}: {
  informations?: string | null;
  reaction?: string | null;
}) {
  if (!informations && !reaction) return null;
  return (
    <section className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
        Retour sur la semaine
      </h2>
      {informations && (
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            Fluctuation des chiffres
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--ink-soft)]">
            {informations}
          </p>
        </div>
      )}
      {reaction && (
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            Recommandations
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--ink-soft)]">
            {reaction}
          </p>
        </div>
      )}
    </section>
  );
}

export function WeekEventsAndBreakdowns({
  weekId,
  events,
  ticketsByType,
  ticketsByAssignee,
  ticketsByRequester,
  onDrill,
}: {
  weekId: string;
  events: {
    automationsMetier: LogEvent[];
    automationsOdoo: LogEvent[];
    phishing: PhishingEvent[];
    maintenances: LogEvent[];
  };
  ticketsByType: Record<string, number>;
  ticketsByAssignee: Record<string, number>;
  ticketsByRequester: Record<string, number>;
  onDrill: (q: DrilldownQuery) => void;
}) {
  const hasEvents =
    events.automationsMetier.length > 0 ||
    events.automationsOdoo.length > 0 ||
    events.maintenances.length > 0 ||
    events.phishing.length > 0;

  return (
    <section className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <EventList
          title="Automatisations métiers"
          items={events.automationsMetier}
        />
        <EventList title="Améliorations Odoo" items={events.automationsOdoo} />
        <EventList
          title="Maintenances production"
          items={events.maintenances}
        />
        {events.phishing.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-[var(--ink)]">
              Tests phishing ratés
            </h3>
            <ul className="space-y-1 text-sm">
              {events.phishing.map((e) => (
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
        {!hasEvents && (
          <p className="text-sm text-[var(--muted)]">
            Aucun événement encodé pour cette semaine.{" "}
            <Link href="/saisie" className="text-[var(--accent-deep)] hover:underline">
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
          data={ticketsByType}
          dimension="type"
          weekId={weekId}
          onDrill={onDrill}
        />
        <Breakdown
          title="Tickets par assigné (Jira)"
          data={ticketsByAssignee}
          dimension="assignee"
          weekId={weekId}
          onDrill={onDrill}
        />
        <Breakdown
          title="Tickets par demandeur"
          data={ticketsByRequester ?? {}}
          dimension="requester"
          weekId={weekId}
          onDrill={onDrill}
        />
      </div>
    </section>
  );
}

export { TicketDrilldown, type DrilldownQuery };
