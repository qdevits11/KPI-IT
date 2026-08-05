"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { LogEvent, PhishingEvent } from "@/lib/types";
import {
  formatFrDate,
  isoWeekPartsFromDate,
  mondayOfIsoWeek,
  todayIsoDate,
  weekIdFromDate,
} from "@/lib/dates";
import { WeekSelector } from "./WeekSelector";

interface WeekOption {
  id: string;
  label: string;
}

type LogAction = "addMetier" | "addOdoo" | "addMaintenance";
type LogCollection =
  | "automationsMetier"
  | "automationsOdoo"
  | "maintenances"
  | "phishing";

const EMPTY_LOG = {
  date: todayIsoDate(),
  explanation: "",
  responsible: "",
};

function defaultDateForWeek(id: string): string {
  const y = Number(id.slice(0, 4));
  const w = Number(id.slice(6));
  if (!Number.isFinite(y) || !Number.isFinite(w)) return todayIsoDate();
  return mondayOfIsoWeek(y, w);
}

export function ManualEntryForm({ initialWeek }: { initialWeek: string }) {
  const [weekId, setWeekId] = useState(initialWeek);
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [logs, setLogs] = useState<{
    automationsMetier: LogEvent[];
    automationsOdoo: LogEvent[];
    phishing: PhishingEvent[];
    maintenances: LogEvent[];
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const initialDate = defaultDateForWeek(initialWeek);
  const [metierForm, setMetierForm] = useState({
    ...EMPTY_LOG,
    date: initialDate,
  });
  const [odooForm, setOdooForm] = useState({ ...EMPTY_LOG, date: initialDate });
  const [maintForm, setMaintForm] = useState({
    ...EMPTY_LOG,
    date: initialDate,
  });
  const [phishForm, setPhishForm] = useState({
    date: initialDate,
    failures: 0,
  });

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
    setLogs({
      automationsMetier: entries.automationsMetier,
      automationsOdoo: entries.automationsOdoo,
      phishing: entries.phishing,
      maintenances: entries.maintenances,
    });
    setWeeks(kpis.weeks);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load(weekId);
    });
  }, [weekId, load]);

  function selectWeek(id: string) {
    const monday = defaultDateForWeek(id);
    setWeekId(id);
    setMetierForm((f) => ({ ...f, date: monday }));
    setOdooForm((f) => ({ ...f, date: monday }));
    setMaintForm((f) => ({ ...f, date: monday }));
    setPhishForm((f) => ({ ...f, date: monday }));
  }

  async function addLog(action: LogAction, form: typeof EMPTY_LOG) {
    if (!form.date || !form.explanation.trim() || !form.responsible.trim()) {
      setError("Date, explication et responsable sont obligatoires.");
      return;
    }
    setMessage(null);
    setError(null);
    const parts = isoWeekPartsFromDate(form.date);
    const res = await fetch("/api/entries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekId: weekIdFromDate(form.date),
        action,
        event: {
          date: form.date,
          year: parts.year,
          month: parts.month,
          week: parts.week,
          explanation: form.explanation.trim(),
          responsible: form.responsible.trim(),
        },
      }),
    });
    if (!res.ok) {
      setError("Ajout échoué");
      return;
    }
    const targetWeek = weekIdFromDate(form.date);
    selectWeek(targetWeek);
    setMessage(`Événement ajouté — semaine ${targetWeek}.`);
    await load(targetWeek);
  }

  async function addPhishing() {
    if (!phishForm.date) {
      setError("La date est obligatoire.");
      return;
    }
    if (phishForm.failures < 0 || !Number.isFinite(phishForm.failures)) {
      setError("Nombre d'échecs invalide.");
      return;
    }
    setMessage(null);
    setError(null);
    const parts = isoWeekPartsFromDate(phishForm.date);
    const keptDate = phishForm.date;
    const res = await fetch("/api/entries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekId: weekIdFromDate(phishForm.date),
        action: "addPhishing",
        event: {
          date: phishForm.date,
          year: parts.year,
          month: parts.month,
          week: parts.week,
          failures: phishForm.failures,
        },
      }),
    });
    if (!res.ok) {
      setError("Ajout échoué");
      return;
    }
    const targetWeek = weekIdFromDate(keptDate);
    selectWeek(targetWeek);
    setPhishForm({ date: keptDate, failures: 0 });
    setMessage(`Test phishing enregistré — semaine ${targetWeek}.`);
    await load(targetWeek);
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

  const weekNum = Number(weekId.slice(6));
  const yearNum = Number(weekId.slice(0, 4));
  const weekLogs = {
    metier:
      logs?.automationsMetier.filter(
        (e) => e.year === yearNum && e.week === weekNum,
      ) ?? [],
    odoo:
      logs?.automationsOdoo.filter(
        (e) => e.year === yearNum && e.week === weekNum,
      ) ?? [],
    phish:
      logs?.phishing.filter(
        (e) => e.year === yearNum && e.week === weekNum,
      ) ?? [],
    maint:
      logs?.maintenances.filter(
        (e) => e.year === yearNum && e.week === weekNum,
      ) ?? [],
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
            Encodage
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Seules ces infos se saisissent à la main : automatisations métiers /
            Odoo, maintenances prod (date, explication, responsable) et tests
            phishing ratés (date, nombre d&apos;échecs). Le reste vient de Jira.
          </p>
        </div>
        {weeks.length > 0 && (
          <WeekSelector weeks={weeks} value={weekId} onChange={selectWeek} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <JournalCard
          title="Automatisations métiers"
          hint="Date · explication · responsable"
          form={metierForm}
          onChange={setMetierForm}
          onSubmit={() => addLog("addMetier", metierForm)}
          pending={pending}
          items={weekLogs.metier}
          onDelete={(id) => removeEvent("automationsMetier", id)}
        />
        <JournalCard
          title="Automatisations Odoo"
          hint="Date · explication · responsable"
          form={odooForm}
          onChange={setOdooForm}
          onSubmit={() => addLog("addOdoo", odooForm)}
          pending={pending}
          items={weekLogs.odoo}
          onDelete={(id) => removeEvent("automationsOdoo", id)}
        />
        <JournalCard
          title="Maintenances production"
          hint="Date · explication · responsable"
          form={maintForm}
          onChange={setMaintForm}
          onSubmit={() => addLog("addMaintenance", maintForm)}
          pending={pending}
          items={weekLogs.maint}
          onDelete={(id) => removeEvent("maintenances", id)}
        />

        <section className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
              Tests phishing ratés
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Date · nombre d&apos;échecs
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Date"
              type="date"
              value={phishForm.date}
              onChange={(v) => setPhishForm({ ...phishForm, date: v })}
            />
            <Field
              label="Nombre d'échecs"
              type="number"
              value={phishForm.failures}
              onChange={(v) =>
                setPhishForm({ ...phishForm, failures: Number(v) || 0 })
              }
            />
          </div>
          {phishForm.date && (
            <p className="text-xs text-[var(--muted)]">
              → semaine {weekIdFromDate(phishForm.date)}
            </p>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => void addPhishing()}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-deep)] disabled:opacity-60"
          >
            Enregistrer le test
          </button>
          <ul className="space-y-1 border-t border-[var(--line)] pt-3 text-sm">
            {weekLogs.phish.length === 0 && (
              <li className="text-[var(--muted)]">Aucun test cette semaine</li>
            )}
            {weekLogs.phish.map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-2 text-[var(--ink-soft)]"
              >
                <span>
                  <span className="tabular-nums text-[var(--muted)]">
                    {e.date ? formatFrDate(e.date) : `S${e.week}`}
                  </span>
                  {" — "}
                  {e.failures} échec{e.failures > 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => void removeEvent("phishing", e.id)}
                  className="text-xs text-[var(--crit)] hover:underline"
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {message && <p className="text-sm text-[var(--ok)]">{message}</p>}
      {error && <p className="text-sm text-[var(--crit)]">{error}</p>}
    </div>
  );
}

function JournalCard({
  title,
  hint,
  form,
  onChange,
  onSubmit,
  pending,
  items,
  onDelete,
}: {
  title: string;
  hint: string;
  form: typeof EMPTY_LOG;
  onChange: (f: typeof EMPTY_LOG) => void;
  onSubmit: () => void;
  pending: boolean;
  items: LogEvent[];
  onDelete: (id: string) => void;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
          {title}
        </h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Date"
          type="date"
          value={form.date}
          onChange={(v) => onChange({ ...form, date: v })}
        />
        <Field
          label="Responsable"
          value={form.responsible}
          onChange={(v) => onChange({ ...form, responsible: v })}
        />
        <Field
          label="Explication"
          value={form.explanation}
          onChange={(v) => onChange({ ...form, explanation: v })}
          wide
        />
      </div>
      {form.date && (
        <p className="text-xs text-[var(--muted)]">
          → semaine {weekIdFromDate(form.date)}
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={onSubmit}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-deep)] disabled:opacity-60"
      >
        Ajouter
      </button>
      <ul className="space-y-1 border-t border-[var(--line)] pt-3 text-sm">
        {items.length === 0 && (
          <li className="text-[var(--muted)]">Aucun événement cette semaine</li>
        )}
        {items.map((e) => (
          <li
            key={e.id}
            className="flex items-start justify-between gap-2 text-[var(--ink-soft)]"
          >
            <span>
              <span className="tabular-nums text-[var(--muted)]">
                {e.date ? formatFrDate(e.date) : `S${e.week}`}
              </span>
              {" — "}
              {e.explanation}{" "}
              <span className="text-[var(--muted)]">({e.responsible})</span>
            </span>
            <button
              type="button"
              onClick={() => onDelete(e.id)}
              className="shrink-0 text-xs text-[var(--crit)] hover:underline"
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  wide,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: "text" | "number" | "date";
  wide?: boolean;
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-sm ${wide ? "sm:col-span-2" : ""}`}
    >
      <span className="text-[var(--muted)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={type === "number" ? 0 : undefined}
        required
        className="rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
      />
    </label>
  );
}
