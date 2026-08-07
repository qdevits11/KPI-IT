"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LogEvent, PhishingEvent, TicketStatDimension } from "@/lib/types";
import {
  ClickableCount,
  TicketDrilldown,
  type DrilldownQuery,
} from "./TicketDrilldown";
import { PersonLabel } from "./PersonAvatar";
import { usePeopleAvatars } from "./PeopleProvider";

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

export function WeekNotesSection({
  weekId,
  informations,
  reaction,
  onSaved,
}: {
  weekId: string;
  informations?: string | null;
  reaction?: string | null;
  onSaved?: () => void;
}) {
  const info = (informations ?? "").trim();
  const reco = (reaction ?? "").trim();
  const missingInfo = !info;
  const incomplete = missingInfo;

  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftInfo, setDraftInfo] = useState(info);
  const [draftReco, setDraftReco] = useState(reco);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) return;
        const json = (await res.json()) as {
          permissions?: { weekRetour?: boolean };
        };
        if (!cancelled) {
          setCanEdit(Boolean(json.permissions?.weekRetour));
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!editing) {
      setDraftInfo(info);
      setDraftReco(reco);
    }
  }, [info, reco, editing]);

  async function generateAnalysis() {
    const hasContent =
      draftInfo.trim().length > 0 ||
      draftReco.trim().length > 0 ||
      info.length > 0 ||
      reco.length > 0;
    if (hasContent) {
      const ok = window.confirm(
        "Remplacer le brouillon actuel par l’analyse générée ?\n(Vous pourrez encore modifier avant d’enregistrer.)",
      );
      if (!ok) return;
    }

    setGenerating(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/week-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekId }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        fluctuation?: string;
        recommandations?: string;
      } | null;
      if (!res.ok) {
        setError(
          data?.error ??
            "Génération impossible — réservé au responsable KPI.",
        );
        return;
      }
      setDraftInfo((data?.fluctuation ?? "").trim());
      setDraftReco((data?.recommandations ?? "").trim());
      setEditing(true);
      setMessage(
        "Analyse générée — relisez, ajustez si besoin, puis enregistrez.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!draftInfo.trim()) {
      setError("La remarque (fluctuation des chiffres) est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/entries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekId,
          action: "updateWeek",
          week: {
            informations: draftInfo.trim(),
            reaction: draftReco.trim(),
          },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error ??
            "Enregistrement échoué — réservé au responsable KPI.",
        );
        return;
      }
      setMessage("Retour enregistré.");
      setEditing(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className={`space-y-3 rounded-xl border p-4 sm:p-5 ${
        incomplete
          ? "border-[var(--warn)]/40 bg-[var(--warn)]/5"
          : "border-[var(--line)] bg-[var(--surface)]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-base text-[var(--ink)]">
            Retour sur la semaine
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Remarque attendue chaque semaine · responsable KPI peut générer
            l’analyse à partir des chiffres
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={generating || saving}
              onClick={() => void generateAnalysis()}
              className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--accent-deep)] hover:bg-[var(--accent)]/15 disabled:opacity-50"
            >
              {generating ? "Génération…" : "Générer l’analyse"}
            </button>
            {!editing && (
              <button
                type="button"
                disabled={generating}
                onClick={() => {
                  setEditing(true);
                  setError(null);
                  setMessage(null);
                }}
                className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--accent-deep)] hover:bg-[var(--wash)] disabled:opacity-50"
              >
                {incomplete ? "Compléter" : "Modifier"}
              </button>
            )}
          </div>
        )}
      </div>

      {incomplete && !editing && (
        <p className="text-sm text-[var(--ink)]">
          Remarque (fluctuation) manquante pour cette semaine.
          {!canEdit && (
            <span className="text-[var(--muted)]">
              {" "}
              Seul le responsable KPI peut l’ajouter.
            </span>
          )}
        </p>
      )}

      {!editing && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
              Fluctuation des chiffres
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--ink-soft)]">
              {info || (
                <span className="italic text-[var(--muted)]">Non renseigné</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
              Recommandations{" "}
              <span className="normal-case tracking-normal">(optionnel)</span>
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--ink-soft)]">
              {reco || (
                <span className="italic text-[var(--muted)]">—</span>
              )}
            </p>
          </div>
        </div>
      )}

      {editing && canEdit && (
        <div className="space-y-3">
          <label className="block space-y-1 text-xs text-[var(--muted)]">
            Fluctuation des chiffres
            <textarea
              value={draftInfo}
              onChange={(e) => setDraftInfo(e.target.value)}
              rows={3}
              required
              className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              placeholder="Ce qui explique les variations de la semaine…"
            />
          </label>
          <label className="block space-y-1 text-xs text-[var(--muted)]">
            Recommandations{" "}
            <span className="text-[var(--muted)]">(optionnel)</span>
            <textarea
              value={draftReco}
              onChange={(e) => setDraftReco(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              placeholder="Actions / pistes d’amélioration…"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-md bg-[var(--ink)] px-3 py-1.5 text-sm text-[var(--paper)] disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-[var(--crit)]">{error}</p>}
      {message && <p className="text-sm text-[var(--ok)]">{message}</p>}
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
  showBreakdowns = true,
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
  /** Ventilations tickets (type / assigné / demandeur) — plutôt côté Analyse. */
  showBreakdowns?: boolean;
}) {
  const hasEvents =
    events.automationsMetier.length > 0 ||
    events.automationsOdoo.length > 0 ||
    events.maintenances.length > 0 ||
    events.phishing.length > 0;

  return (
    <section
      className={`grid gap-8 ${showBreakdowns ? "lg:grid-cols-2" : ""}`}
    >
      {hasEvents && (
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
        </div>
      )}
      {showBreakdowns && (
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
      )}
    </section>
  );
}

export { TicketDrilldown, type DrilldownQuery };
