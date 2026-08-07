"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { KpiValue, LogEvent, PhishingEvent, WeeklyRow } from "@/lib/types";
import { parseWeekId } from "@/lib/types";
import type { OpenTicketsSnapshot, TicketListItem } from "@/lib/jira-tickets";
import { clampWeekIdToCurrent } from "@/lib/dates";
import { WeekSelector } from "./WeekSelector";
import {
  TicketDrilldown,
  WeekEventsAndBreakdowns,
  WeekNotesSection,
  WeekStatusBadge,
  type DrilldownQuery,
} from "./WeekDetailSections";
import {
  QuickEncodeModal,
  type EncodeKind,
} from "./QuickEncodeModal";
import { OpenTicketsByPerson } from "./OpenTicketsByPerson";

interface WeekOption {
  id: string;
  label: string;
}

interface WeekMeta {
  currentWeekId: string;
  isCurrentWeek: boolean;
  isCompleted: boolean;
  isLive: boolean;
  openFrozenAt: string | null;
  jiraSyncedAt: string | null;
  dateRangeLabel: string;
}

type KpisPayload = {
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
};

function kpiValue(kpis: KpiValue[], id: string): number | null {
  return kpis.find((k) => k.id === id)?.value ?? null;
}

function formatCount(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("fr-BE");
}

function formatSyncedAt(iso: string | null): string {
  if (!iso) return "jamais";
  try {
    return new Date(iso).toLocaleString("fr-BE", {
      timeZone: "Europe/Brussels",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type ActionTileProps = {
  label: string;
  value: number | null | undefined;
  hint?: string;
  tone?: "default" | "warn" | "crit" | "accent";
  onClick?: () => void;
  disabled?: boolean;
};

function ActionTile({
  label,
  value,
  hint,
  tone = "default",
  onClick,
  disabled,
}: ActionTileProps) {
  const toneClass =
    tone === "crit"
      ? "border-[var(--crit)]/35 hover:border-[var(--crit)]/60"
      : tone === "warn"
        ? "border-[var(--warn)]/40 hover:border-[var(--warn)]/70"
        : tone === "accent"
          ? "border-[var(--accent)]/35 hover:border-[var(--accent)]/60"
          : "border-[var(--line)] hover:border-[var(--ink-soft)]/40";

  const valueClass =
    tone === "crit"
      ? "text-[var(--crit)]"
      : tone === "warn"
        ? "text-[var(--warn)]"
        : tone === "accent"
          ? "text-[var(--accent-deep)]"
          : "text-[var(--ink)]";

  const inner = (
    <>
      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-1 font-[family-name:var(--font-display)] text-2xl tabular-nums tracking-tight sm:text-3xl ${valueClass}`}
      >
        {formatCount(value)}
      </p>
      {hint ? (
        <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{hint}</p>
      ) : null}
    </>
  );

  const className = `rounded-lg border bg-[var(--surface)] px-3 py-2.5 text-left transition-[border-color,background-color] duration-200 ${
    disabled ? "opacity-80" : "hover:bg-[var(--wash)]"
  } ${toneClass}`;

  if (disabled || !onClick) {
    return <div className={className}>{inner}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

const CURRENT_WEEK_SYNC_FIELDS = {
  demandesItHebdo: true,
  demandesNonResoluesHebdo: true,
  ticketsHorsSlaCloture: true,
  ticketsHorsSlaPriseEnCharge: true,
  ticketsByType: true,
  ticketsByAssignee: true,
  ticketsByRequester: true,
} as const;

export function HomeDashboard({ initialWeek }: { initialWeek: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const weekFromUrl = searchParams.get("week");
  const selectedWeekId = clampWeekIdToCurrent(weekFromUrl ?? initialWeek);

  const [kpis, setKpis] = useState<KpisPayload | null>(null);
  const [openSnap, setOpenSnap] = useState<OpenTicketsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [drill, setDrill] = useState<{
    query: DrilldownQuery;
    tickets?: TicketListItem[];
  } | null>(null);
  const [encodeKind, setEncodeKind] = useState<EncodeKind | null>(null);

  const load = useCallback(async (weekId: string) => {
    setError(null);
    setOpenError(null);

    const kpisRes = await fetch(`/api/kpis?week=${encodeURIComponent(weekId)}`);
    if (!kpisRes.ok) {
      setError("Impossible de charger les indicateurs de la semaine.");
      setKpis(null);
      return;
    }

    const payload = (await kpisRes.json()) as KpisPayload;
    setKpis(payload);

    // Stock live toujours chargé (section Par personne + tuiles live).
    const openRes = await fetch("/api/jira/open");
    if (openRes.ok) {
      setOpenSnap((await openRes.json()) as OpenTicketsSnapshot);
      setOpenError(null);
    } else {
      const body = (await openRes.json().catch(() => null)) as {
        error?: string;
      } | null;
      setOpenError(
        body?.error ??
          "Tickets ouverts indisponibles — vérifiez la connexion Jira.",
      );
      setOpenSnap(null);
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load(selectedWeekId);
    });
  }, [selectedWeekId, load]);

  function selectWeek(id: string) {
    router.replace(`/?week=${encodeURIComponent(id)}`, { scroll: false });
  }

  async function refreshAll() {
    if (!kpis?.meta.isCurrentWeek) return;
    setSyncing(true);
    setMessage(null);
    try {
      const syncRes = await fetch("/api/jira/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekId: selectedWeekId,
          dryRun: false,
          forceOpenLive: true,
          saveFields: CURRENT_WEEK_SYNC_FIELDS,
        }),
      });
      if (syncRes.ok) {
        setMessage("Indicateurs actualisés depuis Jira.");
      } else if (syncRes.status !== 403) {
        const body = (await syncRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        setMessage(body?.error ?? "Sync Jira partielle — données rechargées.");
      }
      await load(selectedWeekId);
    } finally {
      setSyncing(false);
    }
  }

  const list = kpis?.kpis ?? [];
  const week = kpis?.week;
  const meta = kpis?.meta;
  const isLive = meta?.isLive ?? false;
  const isCurrentWeek = meta?.isCurrentWeek ?? false;

  const created = kpiValue(list, "demandes_it_hebdo");
  const openStock = kpiValue(list, "demandes_non_resolues_hebdo");
  const slaPec = kpiValue(list, "hors_sla_prise_en_charge");
  const slaClose = kpiValue(list, "hors_sla_cloture");
  const metier = kpiValue(list, "automations_metier");
  const odoo = kpiValue(list, "ameliorations_odoo");
  const phishing = kpiValue(list, "echecs_phishing");
  const maintenance = kpiValue(list, "maintenances_production");

  const busy = pending || syncing;
  const weekParts = (() => {
    try {
      return week
        ? { year: week.year, week: week.week }
        : parseWeekId(selectedWeekId);
    } catch {
      return null;
    }
  })();
  const weekLabel = weekParts
    ? `S${String(weekParts.week).padStart(2, "0")} — ${weekParts.year}`
    : selectedWeekId;

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
            Tableau de bord
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--ink)] sm:text-4xl">
            {weekLabel}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            {isLive
              ? "Vue d’ensemble pour agir : stock live, SLA et encodage en un clic."
              : "Chiffres arrêtés pour la semaine sélectionnée — ventilations et détail KPI ci-dessous."}{" "}
            {meta?.dateRangeLabel ? meta.dateRangeLabel : null}
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          {kpis && (
            <WeekSelector
              weeks={kpis.weeks}
              value={selectedWeekId}
              onChange={selectWeek}
              currentWeekId={meta?.currentWeekId}
            />
          )}
          {meta && (
            <WeekStatusBadge
              isLive={meta.isLive}
              isCurrentWeek={meta.isCurrentWeek}
              isCompleted={meta.isCompleted}
              openFrozenAt={meta.openFrozenAt}
            />
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-[var(--muted)]">
          Sync Jira : {formatSyncedAt(meta?.jiraSyncedAt ?? null)}
        </p>
        {isCurrentWeek && (
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={busy}
            className="rounded-md bg-[var(--ink)] px-3 py-1.5 text-sm text-[var(--paper)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {syncing ? "Actualisation…" : "Actualiser"}
          </button>
        )}
      </div>

      {message && (
        <p className="rounded-md border border-[var(--ok)]/30 bg-[var(--ok)]/10 px-3 py-2 text-sm text-[var(--ok)]">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-md border border-[var(--crit)]/30 bg-[var(--crit)]/10 px-3 py-2 text-sm text-[var(--crit)]">
          {error}
        </p>
      )}
      {openError && (
        <p className="rounded-md border border-[var(--warn)]/30 bg-[var(--warn)]/10 px-3 py-2 text-sm text-[var(--warn)]">
          {openError}
        </p>
      )}

      {pending && !kpis && (
        <p className="text-sm text-[var(--muted)]">Chargement…</p>
      )}

      {kpis && (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <ActionTile
              label="Créés cette semaine"
              value={created}
              hint={weekLabel}
              onClick={() =>
                setDrill({
                  query: {
                    scope: "created",
                    weekId: selectedWeekId,
                  },
                })
              }
            />
            <ActionTile
              label="Tickets ouverts"
              value={openStock ?? (isLive ? (openSnap?.total ?? null) : null)}
              hint={
                isLive
                  ? "Stock de la semaine en cours"
                  : "Stock figé de la semaine"
              }
              tone="accent"
              onClick={
                isLive && openSnap
                  ? () =>
                      setDrill({
                        query: { scope: "open" },
                        tickets: openSnap.tickets,
                      })
                  : undefined
              }
            />
            <ActionTile
              label="Hors SLA prise en charge"
              value={slaPec}
              hint="> 24 h ouvrées"
              tone={(slaPec ?? 0) > 0 ? "crit" : "default"}
              onClick={() =>
                setDrill({
                  query: {
                    scope: "sla_pec",
                    weekId: selectedWeekId,
                  },
                })
              }
            />
            <ActionTile
              label="Hors SLA clôture"
              value={slaClose}
              hint="> 48 h ouvrées"
              tone={(slaClose ?? 0) > 0 ? "crit" : "default"}
              onClick={() =>
                setDrill({
                  query: {
                    scope: "sla_cloture",
                    weekId: selectedWeekId,
                  },
                })
              }
            />
          </section>

          {isCurrentWeek && openSnap && (
            <OpenTicketsByPerson
              data={openSnap}
              onDrill={(query, tickets) => setDrill({ query, tickets })}
            />
          )}

          <section className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="font-[family-name:var(--font-display)] text-base text-[var(--ink)]">
                Encodage
              </h2>
              <Link
                href="/saisie"
                className="text-xs font-medium text-[var(--accent-deep)] hover:underline"
              >
                Formulaire complet
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <ActionTile
                label="Automatisations métier"
                value={metier}
                onClick={
                  isCurrentWeek ? () => setEncodeKind("metier") : undefined
                }
                disabled={!isCurrentWeek}
              />
              <ActionTile
                label="Améliorations Odoo"
                value={odoo}
                tone="accent"
                onClick={
                  isCurrentWeek ? () => setEncodeKind("odoo") : undefined
                }
                disabled={!isCurrentWeek}
              />
              <ActionTile
                label="Maintenances prod"
                value={maintenance}
                onClick={
                  isCurrentWeek ? () => setEncodeKind("maintenance") : undefined
                }
                disabled={!isCurrentWeek}
              />
              <ActionTile
                label="Phishing ratés"
                value={phishing}
                tone={(phishing ?? 0) > 0 ? "warn" : "default"}
                onClick={
                  isCurrentWeek ? () => setEncodeKind("phishing") : undefined
                }
                disabled={!isCurrentWeek}
              />
            </div>
          </section>

          <WeekNotesSection
            informations={kpis.week.informations}
            reaction={kpis.week.reaction}
          />

          <WeekEventsAndBreakdowns
            weekId={selectedWeekId}
            events={kpis.events}
            ticketsByType={{}}
            ticketsByAssignee={{}}
            ticketsByRequester={{}}
            onDrill={(query) => setDrill({ query })}
            showBreakdowns={false}
          />
        </>
      )}

      {drill && (
        <TicketDrilldown
          query={drill.query}
          presetTickets={drill.tickets}
          onClose={() => setDrill(null)}
        />
      )}
      {encodeKind && (
        <QuickEncodeModal
          kind={encodeKind}
          onClose={() => setEncodeKind(null)}
          onSaved={() => {
            setMessage("Encodage enregistré.");
            void load(selectedWeekId);
          }}
        />
      )}
    </div>
  );
}
