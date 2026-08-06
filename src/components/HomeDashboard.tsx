"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { KpiValue, WeeklyRow } from "@/lib/types";
import type { OpenTicketsSnapshot } from "@/lib/jira-tickets";
import {
  TicketDrilldown,
  type DrilldownQuery,
} from "./TicketDrilldown";
import {
  QuickEncodeModal,
  type EncodeKind,
} from "./QuickEncodeModal";

type KpisPayload = {
  week: WeeklyRow;
  kpis: KpiValue[];
  meta: {
    currentWeekId: string;
    isCurrentWeek: boolean;
    isLive: boolean;
    dateRangeLabel: string;
    jiraSyncedAt: string | null;
  };
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
  hint: string;
  tone?: "default" | "warn" | "crit" | "accent";
  onClick?: () => void;
  href?: string;
  cta?: string;
};

function ActionTile({
  label,
  value,
  hint,
  tone = "default",
  onClick,
  href,
  cta,
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
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-3 font-[family-name:var(--font-display)] text-4xl tabular-nums tracking-tight ${valueClass}`}
      >
        {formatCount(value)}
      </p>
      <p className="mt-2 text-sm text-[var(--ink-soft)]">{hint}</p>
      {cta && (
        <p className="mt-4 text-sm font-medium text-[var(--accent-deep)]">
          {cta} <span aria-hidden>→</span>
        </p>
      )}
    </>
  );

  const className = `group flex h-full flex-col rounded-xl border bg-[var(--surface)] p-5 text-left transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(19,32,51,0.35)] ${toneClass}`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
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

export function HomeDashboard() {
  const [kpis, setKpis] = useState<KpisPayload | null>(null);
  const [openSnap, setOpenSnap] = useState<OpenTicketsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrilldownQuery | null>(null);
  const [encodeKind, setEncodeKind] = useState<EncodeKind | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setOpenError(null);
    const [kpisRes, openRes] = await Promise.all([
      fetch("/api/kpis"),
      fetch("/api/jira/open"),
    ]);

    if (!kpisRes.ok) {
      setError("Impossible de charger les indicateurs de la semaine.");
    } else {
      setKpis((await kpisRes.json()) as KpisPayload);
    }

    if (openRes.ok) {
      setOpenSnap((await openRes.json()) as OpenTicketsSnapshot);
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
      void load();
    });
  }, [load]);

  async function refreshAll() {
    setSyncing(true);
    setMessage(null);
    try {
      // Sync Jira réservée admin — sinon on recharge juste le stock live + KPI DB
      if (kpis?.meta.currentWeekId) {
        const syncRes = await fetch("/api/jira/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            weekId: kpis.meta.currentWeekId,
            fields: CURRENT_WEEK_SYNC_FIELDS,
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
      }
      await load();
    } finally {
      setSyncing(false);
    }
  }

  const list = kpis?.kpis ?? [];
  const week = kpis?.week;
  const created = kpiValue(list, "demandes_it_hebdo");
  const openStock = kpiValue(list, "demandes_non_resolues_hebdo");
  const slaPec = kpiValue(list, "hors_sla_prise_en_charge");
  const slaClose = kpiValue(list, "hors_sla_cloture");
  const metier = kpiValue(list, "automations_metier");
  const odoo = kpiValue(list, "ameliorations_odoo");
  const phishing = kpiValue(list, "echecs_phishing");
  const maintenance = kpiValue(list, "maintenances_production");

  const busy = pending || syncing;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
            Tableau de bord
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--ink)] sm:text-4xl">
            État actuel
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Vue d’ensemble pour agir : stock live, SLA de la semaine, et
            encodage en un clic.{" "}
            {kpis?.meta.dateRangeLabel
              ? `Semaine en cours : ${kpis.meta.dateRangeLabel}.`
              : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-[var(--muted)]">
            Sync : {formatSyncedAt(kpis?.meta.jiraSyncedAt ?? null)}
          </p>
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={busy}
            className="rounded-md bg-[var(--ink)] px-3 py-1.5 text-sm text-[var(--paper)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {syncing ? "Actualisation…" : "Actualiser"}
          </button>
          <Link
            href="/semaine"
            className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]"
          >
            Détail semaine
          </Link>
        </div>
      </header>

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

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
          Tickets à traiter
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <ActionTile
            label="Tickets ouverts"
            value={openSnap?.total ?? openStock}
            hint="Stock live Jira (tous statuts ouverts)"
            tone="accent"
            cta="Voir la liste"
            onClick={() => setDrill({ scope: "open" })}
          />
          <ActionTile
            label="Non attribués"
            value={openSnap?.unassigned ?? null}
            hint="Ouverts sans assigné — à répartir"
            tone={(openSnap?.unassigned ?? 0) > 0 ? "warn" : "default"}
            cta="Traiter"
            onClick={() =>
              setDrill({ scope: "open", assignee: "Non assigné" })
            }
          />
          <ActionTile
            label="Créés cette semaine"
            value={created}
            hint="Demandes IT ouvertes dans la semaine ISO"
            cta="Voir la semaine"
            href="/semaine"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
          SLA · semaine {week ? `S${String(week.week).padStart(2, "0")}` : "…"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <ActionTile
            label="Hors SLA prise en charge"
            value={slaPec}
            hint="> 24 h ouvrées avant prise en charge"
            tone={(slaPec ?? 0) > 0 ? "crit" : "default"}
            cta="Ouvrir la semaine"
            href="/semaine"
          />
          <ActionTile
            label="Hors SLA clôture"
            value={slaClose}
            hint="> 48 h ouvrées avant clôture"
            tone={(slaClose ?? 0) > 0 ? "crit" : "default"}
            cta="Ouvrir la semaine"
            href="/semaine"
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
            Encodage de la semaine
          </h2>
          <Link
            href="/saisie"
            className="text-sm font-medium text-[var(--accent-deep)] hover:underline"
          >
            Formulaire complet
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ActionTile
            label="Automatisations métier"
            value={metier}
            hint="Cliquez pour en ajouter une"
            cta="Encoder"
            onClick={() => setEncodeKind("metier")}
          />
          <ActionTile
            label="Améliorations Odoo"
            value={odoo}
            hint="Cliquez pour en ajouter une"
            tone="accent"
            cta="Encoder"
            onClick={() => setEncodeKind("odoo")}
          />
          <ActionTile
            label="Maintenances prod"
            value={maintenance}
            hint="Cliquez pour en ajouter une"
            cta="Encoder"
            onClick={() => setEncodeKind("maintenance")}
          />
          <ActionTile
            label="Phishing ratés"
            value={phishing}
            hint="Cliquez pour encoder des échecs"
            tone={(phishing ?? 0) > 0 ? "warn" : "default"}
            cta="Encoder"
            onClick={() => setEncodeKind("phishing")}
          />
        </div>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)]/70 px-5 py-4">
        <p className="text-sm text-[var(--muted)]">
          Pour l’historique annuel et les ventilations tickets, utilisez{" "}
          <Link
            href="/analyse"
            className="font-medium text-[var(--accent-deep)] hover:underline"
          >
            Analyse
          </Link>
          . Pour le détail d’une semaine passée :{" "}
          <Link
            href="/semaine"
            className="font-medium text-[var(--accent-deep)] hover:underline"
          >
            Semaine
          </Link>
          .
        </p>
      </section>

      {drill && (
        <TicketDrilldown query={drill} onClose={() => setDrill(null)} />
      )}
      {encodeKind && (
        <QuickEncodeModal
          kind={encodeKind}
          onClose={() => setEncodeKind(null)}
          onSaved={() => {
            setMessage("Encodage enregistré.");
            void load();
          }}
        />
      )}
    </div>
  );
}
