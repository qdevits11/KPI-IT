"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { LogEvent, PhishingEvent, WeeklyRow } from "@/lib/types";
import { WeekSelector } from "./WeekSelector";

interface WeekOption {
  id: string;
  label: string;
}

export function ManualEntryForm({ initialWeek }: { initialWeek: string }) {
  const [weekId, setWeekId] = useState(initialWeek);
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [week, setWeek] = useState<WeeklyRow | null>(null);
  const [logs, setLogs] = useState<{
    automationsMetier: LogEvent[];
    automationsOdoo: LogEvent[];
    phishing: PhishingEvent[];
    maintenances: LogEvent[];
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [eventForm, setEventForm] = useState({
    explanation: "",
    responsible: "",
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
    setWeek(entries.week);
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

  async function saveWeek(e: React.FormEvent) {
    e.preventDefault();
    if (!week) return;
    setMessage(null);
    setError(null);
    const res = await fetch("/api/entries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekId,
        action: "updateWeek",
        week: {
          ticketsHorsSlaCloture: week.ticketsHorsSlaCloture,
          ticketsHorsSlaPriseEnCharge: week.ticketsHorsSlaPriseEnCharge,
          demandesItHebdo: week.demandesItHebdo,
          demandesNonResoluesHebdo: week.demandesNonResoluesHebdo,
          informations: week.informations,
          reaction: week.reaction,
        },
      }),
    });
    if (!res.ok) {
      setError("Enregistrement échoué");
      return;
    }
    setMessage("Semaine enregistrée — YTD recalculé.");
  }

  async function addEvent(
    action: "addMetier" | "addOdoo" | "addPhishing" | "addMaintenance",
  ) {
    if (!week || !eventForm.explanation.trim()) return;
    setMessage(null);
    const res = await fetch("/api/entries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekId,
        action,
        event: {
          year: week.year,
          month: week.month,
          week: week.week,
          explanation: eventForm.explanation,
          responsible: eventForm.responsible || "IT",
          failures: eventForm.failures,
        },
      }),
    });
    if (!res.ok) {
      setError("Ajout échoué");
      return;
    }
    setEventForm({ explanation: "", responsible: "", failures: 0 });
    setMessage("Événement ajouté — compteurs recalculés.");
    await load(weekId);
  }

  function num(field: keyof WeeklyRow, value: string) {
    const n = value === "" ? null : Number(value);
    setWeek((prev) =>
      prev
        ? {
            ...prev,
            [field]: n !== null && Number.isFinite(n) ? n : null,
          }
        : prev,
    );
  }

  const weekNum = week?.week;
  const weekLogs = {
    metier: logs?.automationsMetier.filter((e) => e.week === weekNum) ?? [],
    odoo: logs?.automationsOdoo.filter((e) => e.week === weekNum) ?? [],
    phish: logs?.phishing.filter((e) => e.week === weekNum) ?? [],
    maint: logs?.maintenances.filter((e) => e.week === weekNum) ?? [],
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
            Saisie manuelle
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            SLA, demandes, remarques, et journaux (automations, Odoo, phishing,
            maintenance) — comme dans KPI.xlsx.
          </p>
        </div>
        {weeks.length > 0 && (
          <WeekSelector weeks={weeks} value={weekId} onChange={setWeekId} />
        )}
      </div>

      {week && (
        <form onSubmit={saveWeek} className="space-y-6">
          <section className="space-y-3">
            <h2 className="border-b border-[var(--line)] pb-2 font-[family-name:var(--font-display)] text-xl">
              Indicateurs semaine
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="Hors SLA clôture"
                type="number"
                value={week.ticketsHorsSlaCloture ?? ""}
                onChange={(v) => num("ticketsHorsSlaCloture", v)}
              />
              <Field
                label="Hors SLA prise en charge"
                type="number"
                value={week.ticketsHorsSlaPriseEnCharge ?? ""}
                onChange={(v) => num("ticketsHorsSlaPriseEnCharge", v)}
              />
              <Field
                label="Demandes IT (hebdo)"
                type="number"
                value={week.demandesItHebdo ?? ""}
                onChange={(v) => num("demandesItHebdo", v)}
              />
              <Field
                label="Non résolues (hebdo)"
                type="number"
                value={week.demandesNonResoluesHebdo ?? ""}
                onChange={(v) => num("demandesNonResoluesHebdo", v)}
              />
              <Field
                label="Informations"
                value={week.informations}
                onChange={(v) => setWeek({ ...week, informations: v })}
                wide
              />
              <Field
                label="Réaction"
                value={week.reaction}
                onChange={(v) => setWeek({ ...week, reaction: v })}
                wide
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-deep)]"
            >
              Enregistrer la semaine
            </button>
          </section>
        </form>
      )}

      <section className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-xl">
          Ajouter un événement (journal)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Explication"
            value={eventForm.explanation}
            onChange={(v) => setEventForm({ ...eventForm, explanation: v })}
            wide
          />
          <Field
            label="Responsable"
            value={eventForm.responsible}
            onChange={(v) => setEventForm({ ...eventForm, responsible: v })}
          />
          <Field
            label="Échecs (phishing)"
            type="number"
            value={eventForm.failures}
            onChange={(v) =>
              setEventForm({ ...eventForm, failures: Number(v) || 0 })
            }
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => addEvent("addMetier")}
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--wash)]"
          >
            + Automation métier
          </button>
          <button
            type="button"
            onClick={() => addEvent("addOdoo")}
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--wash)]"
          >
            + Amélioration Odoo
          </button>
          <button
            type="button"
            onClick={() => addEvent("addPhishing")}
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--wash)]"
          >
            + Test phishing
          </button>
          <button
            type="button"
            onClick={() => addEvent("addMaintenance")}
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--wash)]"
          >
            + Maintenance prod
          </button>
        </div>

        <div className="grid gap-4 pt-2 sm:grid-cols-2 text-sm">
          <LogBlock title="Métiers cette semaine" items={weekLogs.metier} />
          <LogBlock title="Odoo cette semaine" items={weekLogs.odoo} />
          <LogBlock title="Maintenances" items={weekLogs.maint} />
          <div>
            <h3 className="font-medium text-[var(--ink)]">Phishing</h3>
            <ul className="mt-1 space-y-1 text-[var(--ink-soft)]">
              {weekLogs.phish.length === 0 && (
                <li className="text-[var(--muted)]">Aucun</li>
              )}
              {weekLogs.phish.map((e) => (
                <li key={e.id}>
                  {e.explanation || "Campagne"} — {e.responsible} ({e.failures}{" "}
                  échecs)
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {message && <p className="text-sm text-[var(--ok)]">{message}</p>}
      {error && <p className="text-sm text-[var(--crit)]">{error}</p>}
    </div>
  );
}

function LogBlock({ title, items }: { title: string; items: LogEvent[] }) {
  return (
    <div>
      <h3 className="font-medium text-[var(--ink)]">{title}</h3>
      <ul className="mt-1 space-y-1 text-[var(--ink-soft)]">
        {items.length === 0 && <li className="text-[var(--muted)]">Aucun</li>}
        {items.map((e) => (
          <li key={e.id}>
            {e.explanation} — {e.responsible}
          </li>
        ))}
      </ul>
    </div>
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
  type?: "text" | "number";
  wide?: boolean;
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-sm ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}
    >
      <span className="text-[var(--muted)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={type === "number" ? 0 : undefined}
        className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
      />
    </label>
  );
}
