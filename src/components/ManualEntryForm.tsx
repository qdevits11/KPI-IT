"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { LogEvent, PhishingEvent, WeeklyRow } from "@/lib/types";
import {
  formatFrDate,
  isoWeekPartsFromDate,
  todayIsoDate,
  weekIdFromDate,
} from "@/lib/dates";
import { WeekSelector } from "./WeekSelector";

type EntryKind = "metier" | "odoo" | "maintenance" | "phishing" | "retour";

type LogAction = "addMetier" | "addOdoo" | "addMaintenance";
type LogCollection =
  | "automationsMetier"
  | "automationsOdoo"
  | "maintenances"
  | "phishing";

interface WeekOption {
  id: string;
  label: string;
}

const KINDS: Array<{
  id: EntryKind;
  label: string;
  short: string;
  fields: string;
  action?: LogAction;
  collection?: LogCollection;
}> = [
  {
    id: "metier",
    label: "Automatisation métier",
    short: "Métier",
    fields: "Date, explication, responsable",
    action: "addMetier",
    collection: "automationsMetier",
  },
  {
    id: "odoo",
    label: "Automatisation Odoo",
    short: "Odoo",
    fields: "Date, explication, responsable",
    action: "addOdoo",
    collection: "automationsOdoo",
  },
  {
    id: "maintenance",
    label: "Maintenance production",
    short: "Maintenance",
    fields: "Date, explication, responsable",
    action: "addMaintenance",
    collection: "maintenances",
  },
  {
    id: "phishing",
    label: "Test phishing raté",
    short: "Phishing",
    fields: "Date, nombre d'échecs",
    collection: "phishing",
  },
  {
    id: "retour",
    label: "Retour sur la semaine",
    short: "Retour",
    fields: "Fluctuation des chiffres · recommandations",
  },
];

export function ManualEntryForm({ initialWeek }: { initialWeek: string }) {
  const [kind, setKind] = useState<EntryKind>("metier");
  const [weekId, setWeekId] = useState(initialWeek);
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [week, setWeek] = useState<WeeklyRow | null>(null);
  const [logs, setLogs] = useState<{
    automationsMetier: LogEvent[];
    automationsOdoo: LogEvent[];
    phishing: PhishingEvent[];
    maintenances: LogEvent[];
  } | null>(null);
  const [responsibles, setResponsibles] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(todayIsoDate());
  const [explanation, setExplanation] = useState("");
  const [responsible, setResponsible] = useState("");
  const [failures, setFailures] = useState(0);
  const [fluctuation, setFluctuation] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [canEditRetour, setCanEditRetour] = useState(false);

  const load = useCallback(async (id: string) => {
    setError(null);
    const [entriesRes, kpisRes] = await Promise.all([
      fetch(`/api/entries?week=${encodeURIComponent(id)}`),
      fetch(`/api/kpis?week=${encodeURIComponent(id)}`),
    ]);
    if (!entriesRes.ok || !kpisRes.ok) {
      setError("Chargement impossible");
      return;
    }
    const entries = await entriesRes.json();
    const kpis = await kpisRes.json();
    setWeek(entries.week);
    setLogs({
      automationsMetier: entries.automationsMetier,
      automationsOdoo: entries.automationsOdoo,
      phishing: entries.phishing,
      maintenances: entries.maintenances,
    });
    if (Array.isArray(entries.responsibles)) {
      setResponsibles(entries.responsibles);
    }
    if (Array.isArray(kpis.weeks)) {
      setWeeks(kpis.weeks);
    }
    setFluctuation(entries.week?.informations ?? "");
    setRecommendations(entries.week?.reaction ?? "");
    const allowRetour = Boolean(entries.permissions?.weekRetour);
    setCanEditRetour(allowRetour);
    if (!allowRetour) {
      setKind((prev) => (prev === "retour" ? "metier" : prev));
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load(weekId);
    });
  }, [weekId, load]);

  function resetFields(keepDate = true) {
    if (!keepDate) setDate(todayIsoDate());
    setExplanation("");
    setResponsible("");
    setFailures(0);
  }

  function selectKind(next: EntryKind) {
    setKind(next);
    setMessage(null);
    setError(null);
    resetFields(false);
    if (next === "retour" && week) {
      setFluctuation(week.informations ?? "");
      setRecommendations(week.reaction ?? "");
    }
  }

  function backToChoices() {
    setKind("metier");
    setMessage(null);
    setError(null);
    resetFields(false);
  }

  async function submitLog(action: LogAction) {
    if (!date || !explanation.trim() || !responsible.trim()) {
      setError("Date, explication et responsable sont obligatoires.");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const parts = isoWeekPartsFromDate(date);
      const res = await fetch("/api/entries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekId: weekIdFromDate(date),
          action,
          event: {
            date,
            year: parts.year,
            month: parts.month,
            week: parts.week,
            explanation: explanation.trim(),
            responsible: responsible.trim(),
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Enregistrement échoué");
        return;
      }
      const targetWeek = weekIdFromDate(date);
      setWeekId(targetWeek);
      resetFields(true);
      setMessage("Enregistré — merci ! Vous pouvez en ajouter un autre.");
      await load(targetWeek);
    } finally {
      setSaving(false);
    }
  }

  async function submitPhishing() {
    if (!date) {
      setError("La date est obligatoire.");
      return;
    }
    if (failures < 0 || !Number.isFinite(failures)) {
      setError("Nombre d'échecs invalide.");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const parts = isoWeekPartsFromDate(date);
      const res = await fetch("/api/entries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekId: weekIdFromDate(date),
          action: "addPhishing",
          event: {
            date,
            year: parts.year,
            month: parts.month,
            week: parts.week,
            failures,
          },
        }),
      });
      if (!res.ok) {
        setError("Enregistrement échoué");
        return;
      }
      const targetWeek = weekIdFromDate(date);
      setWeekId(targetWeek);
      setFailures(0);
      setMessage("Test phishing enregistré — merci !");
      await load(targetWeek);
    } finally {
      setSaving(false);
    }
  }

  async function submitRetour() {
    if (!fluctuation.trim()) {
      setError("La remarque (fluctuation des chiffres) est obligatoire.");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/entries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekId,
          action: "updateWeek",
          week: {
            informations: fluctuation.trim(),
            reaction: recommendations.trim(),
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Enregistrement échoué");
        return;
      }
      setMessage(`Retour enregistré pour ${weekId}.`);
      await load(weekId);
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(collection: LogCollection, eventId: string) {
    setMessage(null);
    setError(null);
    const res = await fetch("/api/entries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekId,
        action: "deleteEvent",
        collection,
        eventId,
      }),
    });
    if (!res.ok) {
      setError("Suppression échouée");
      return;
    }
    setMessage("Événement supprimé.");
    await load(weekId);
  }

  const active = kind ? KINDS.find((k) => k.id === kind)! : null;
  const weekNum = Number(weekId.slice(6));
  const yearNum = Number(weekId.slice(0, 4));
  const visibleKinds = KINDS.filter(
    (k) => k.id !== "retour" || canEditRetour,
  );

  const recentItems = (() => {
    if (!kind || !logs || kind === "retour") {
      return [] as Array<LogEvent | PhishingEvent>;
    }
    if (kind === "metier") {
      return logs.automationsMetier.filter(
        (e) => e.year === yearNum && e.week === weekNum,
      );
    }
    if (kind === "odoo") {
      return logs.automationsOdoo.filter(
        (e) => e.year === yearNum && e.week === weekNum,
      );
    }
    if (kind === "maintenance") {
      return logs.maintenances.filter(
        (e) => e.year === yearNum && e.week === weekNum,
      );
    }
    return logs.phishing.filter(
      (e) => e.year === yearNum && e.week === weekNum,
    );
  })();

  const busy = pending || saving;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-2 text-center sm:text-left">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)] sm:text-4xl">
          Encodage
        </h1>
        <p className="text-sm text-[var(--muted)] sm:text-base">
          {kind
            ? kind === "retour"
              ? "Commentez la semaine : fluctuation des KPI et pistes d’amélioration."
              : "Remplissez le formulaire — la semaine est calculée automatiquement."
            : "Qu’avez-vous fait ? Choisissez le type à encoder."}
        </p>
      </header>

      <nav
        aria-label="Type d'encodage"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      >
        {visibleKinds.map((k) => {
          const selected = kind === k.id;
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => selectKind(k.id)}
              aria-pressed={selected}
              className={`group rounded-xl border px-3 py-4 text-left transition-all duration-200 sm:px-4 ${
                selected
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white shadow-md shadow-teal-900/10"
                  : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--accent)] hover:bg-[var(--wash)]"
              } ${k.id === "retour" ? "sm:col-span-1 col-span-2" : ""}`}
            >
              <span
                className={`block font-[family-name:var(--font-display)] text-sm leading-tight sm:text-base ${
                  selected ? "text-white" : "text-[var(--ink)]"
                }`}
              >
                {k.short}
              </span>
              <span
                className={`mt-1 block text-[11px] leading-snug sm:text-xs ${
                  selected ? "text-white/80" : "text-[var(--muted)]"
                }`}
              >
                {k.fields}
              </span>
            </button>
          );
        })}
      </nav>

      {!kind && (
        <p className="text-center text-sm text-[var(--muted)]">
          Un clic → un formulaire. Idéal juste après une tâche ou en fin de
          semaine.
        </p>
      )}

      {active && active.id === "retour" && (
        <section
          className="space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7"
          style={{ animation: "rise-in 0.35s ease both" }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)] sm:text-2xl">
                {active.label}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{active.fields}</p>
            </div>
            <div className="flex items-center gap-3">
              {weeks.length > 0 && (
                <WeekSelector
                  weeks={weeks}
                  value={weekId}
                  onChange={setWeekId}
                />
              )}
              <button
                type="button"
                onClick={backToChoices}
                className="shrink-0 text-sm text-[var(--muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
              >
                Changer
              </button>
            </div>
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitRetour();
            }}
          >
            <TextArea
              label="Remarque sur la fluctuation des chiffres"
              value={fluctuation}
              onChange={setFluctuation}
              placeholder="Ex. Hausse des demandes due à la formation Bandi, SLA dégradé car absences…"
              autoFocus
            />
            <TextArea
              label="Recommandations pour améliorer le service"
              value={recommendations}
              onChange={setRecommendations}
              placeholder="Ex. Renforcer le backup, documenter la procédure, anticiper les pics…"
            />

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-deep)] disabled:opacity-60"
              >
                {busy ? "Enregistrement…" : "Enregistrer le retour"}
              </button>
              <button
                type="button"
                onClick={backToChoices}
                className="rounded-md px-3 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
              >
                Annuler
              </button>
            </div>
          </form>

          {message && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-[var(--ok)]">
              {message}
            </p>
          )}
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--crit)]">
              {error}
            </p>
          )}
        </section>
      )}

      {active && active.id !== "retour" && (
        <section
          className="space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7"
          style={{ animation: "rise-in 0.35s ease both" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)] sm:text-2xl">
                {active.label}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{active.fields}</p>
            </div>
            <button
              type="button"
              onClick={backToChoices}
              className="shrink-0 text-sm text-[var(--muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
            >
              Changer
            </button>
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (active.id === "phishing") {
                void submitPhishing();
              } else if (active.action) {
                void submitLog(active.action);
              }
            }}
          >
            <Field
              label="Date"
              type="date"
              value={date}
              onChange={setDate}
              autoFocus
            />
            {date && (
              <p className="text-xs text-[var(--muted)]">
                Semaine {weekIdFromDate(date)}
              </p>
            )}

            {active.id === "phishing" ? (
              <Field
                label="Nombre d'échecs"
                type="number"
                value={failures}
                onChange={(v) => setFailures(Number(v) || 0)}
              />
            ) : (
              <>
                <Field
                  label="Explication"
                  value={explanation}
                  onChange={setExplanation}
                  placeholder="Ex. Flux B2C, redémarrage Smartscans…"
                />
                <ResponsibleSelect
                  value={responsible}
                  options={responsibles}
                  onChange={setResponsible}
                />
              </>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-deep)] disabled:opacity-60"
              >
                {busy ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button
                type="button"
                onClick={backToChoices}
                className="rounded-md px-3 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
              >
                Annuler
              </button>
            </div>
          </form>

          {message && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-[var(--ok)]">
              {message}
            </p>
          )}
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--crit)]">
              {error}
            </p>
          )}

          <div className="border-t border-[var(--line)] pt-4">
            <h3 className="text-sm font-medium text-[var(--ink)]">
              Cette semaine ({weekId})
            </h3>
            <ul className="mt-2 space-y-2 text-sm">
              {recentItems.length === 0 && (
                <li className="text-[var(--muted)]">
                  Aucun encodage pour l’instant
                </li>
              )}
              {recentItems.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start justify-between gap-3 border-l-2 border-[var(--accent)] pl-3 text-[var(--ink-soft)]"
                >
                  <span>
                    <span className="tabular-nums text-[var(--muted)]">
                      {"date" in e && e.date
                        ? formatFrDate(e.date)
                        : `S${e.week}`}
                    </span>
                    {" — "}
                    {kind === "phishing" ? (
                      <>
                        {(e as PhishingEvent).failures} échec
                        {(e as PhishingEvent).failures > 1 ? "s" : ""}
                      </>
                    ) : (
                      <>
                        {(e as LogEvent).explanation}{" "}
                        <span className="text-[var(--muted)]">
                          ({(e as LogEvent).responsible})
                        </span>
                      </>
                    )}
                  </span>
                  {active.collection && (
                    <button
                      type="button"
                      onClick={() =>
                        void removeEvent(active.collection!, e.id)
                      }
                      className="shrink-0 text-xs text-[var(--crit)] hover:underline"
                    >
                      Supprimer
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function ResponsibleSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-[var(--ink-soft)]">
        Responsable d&apos;encodage
      </span>
      <select
        value={value}
        required
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-base text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
      >
        <option value="" disabled>
          Choisir…
        </option>
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {options.length === 0 && (
        <span className="text-xs text-[var(--crit)]">
          Aucun responsable d&apos;encodage — allez dans Configuration.
        </span>
      )}
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: "text" | "number" | "date";
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-[var(--ink-soft)]">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        min={type === "number" ? 0 : undefined}
        required
        className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-base text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-[var(--ink-soft)]">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="resize-y rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-base text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
      />
    </label>
  );
}
