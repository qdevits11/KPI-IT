"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { ManualEntries, Period } from "@/lib/types";
import { PeriodSelector } from "./PeriodSelector";

const emptyManual = (): ManualEntries => ({
  deviceUpdates: {
    devicesTotal: 0,
    devicesUpToDate: 0,
    campaignName: "",
    notes: "",
  },
  odooAutomations: {
    activeAutomations: 0,
    newThisPeriod: 0,
    successfulRuns: 0,
    totalRuns: 0,
    notes: "",
  },
  businessAutomations: {
    activeAutomations: 0,
    newThisPeriod: 0,
    estimatedHoursSaved: 0,
    notes: "",
  },
  phishingTests: {
    participants: 0,
    clicked: 0,
    reported: 0,
    campaignName: "",
    notes: "",
  },
  productionMaintenance: {
    plannedInterventions: 0,
    completedInterventions: 0,
    unplannedIncidents: 0,
    downtimeMinutes: 0,
    periodMinutes: 30 * 24 * 60,
    notes: "",
  },
  updatedAt: null,
  updatedBy: null,
});

interface Props {
  initialPeriod: string;
}

export function ManualEntryForm({ initialPeriod }: Props) {
  const [periodId, setPeriodId] = useState(initialPeriod);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [manual, setManual] = useState<ManualEntries>(emptyManual());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async (id: string) => {
    setError(null);
    const [entriesRes, kpisRes] = await Promise.all([
      fetch(`/api/entries?period=${encodeURIComponent(id)}`),
      fetch(`/api/kpis?period=${encodeURIComponent(id)}`),
    ]);
    if (!entriesRes.ok || !kpisRes.ok) {
      setError("Chargement impossible");
      return;
    }
    const entries = await entriesRes.json();
    const kpis = await kpisRes.json();
    setManual(entries.manual);
    setPeriods(kpis.periods);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load(periodId);
    });
  }, [periodId, load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const res = await fetch("/api/entries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId, manual, updatedBy: "IT" }),
    });
    if (!res.ok) {
      setError("Enregistrement échoué");
      return;
    }
    setMessage("Saisie enregistrée — les KPI ont été recalculés.");
  }

  function num(
    section: keyof Omit<ManualEntries, "updatedAt" | "updatedBy">,
    field: string,
    value: string,
  ) {
    const n = value === "" ? 0 : Number(value);
    setManual((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] as unknown as Record<string, unknown>),
        [field]: Number.isFinite(n) ? n : 0,
      },
    }));
  }

  function str(
    section: keyof Omit<ManualEntries, "updatedAt" | "updatedBy">,
    field: string,
    value: string,
  ) {
    setManual((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] as unknown as Record<string, unknown>),
        [field]: value,
      },
    }));
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
            Saisie manuelle
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Données non disponibles dans Jira : appareils, Odoo, métier,
            phishing et maintenance production.
          </p>
        </div>
        {periods.length > 0 && (
          <PeriodSelector
            periods={periods}
            value={periodId}
            onChange={setPeriodId}
          />
        )}
      </div>

      <form onSubmit={save} className="space-y-8">
        <Section title="Mises à jour des appareils">
          <Field
            label="Parc total"
            type="number"
            value={manual.deviceUpdates.devicesTotal}
            onChange={(v) => num("deviceUpdates", "devicesTotal", v)}
          />
          <Field
            label="Appareils à jour"
            type="number"
            value={manual.deviceUpdates.devicesUpToDate}
            onChange={(v) => num("deviceUpdates", "devicesUpToDate", v)}
          />
          <Field
            label="Campagne"
            value={manual.deviceUpdates.campaignName}
            onChange={(v) => str("deviceUpdates", "campaignName", v)}
          />
          <Field
            label="Notes"
            value={manual.deviceUpdates.notes}
            onChange={(v) => str("deviceUpdates", "notes", v)}
            wide
          />
        </Section>

        <Section title="Automatisations Odoo">
          <Field
            label="Actives"
            type="number"
            value={manual.odooAutomations.activeAutomations}
            onChange={(v) => num("odooAutomations", "activeAutomations", v)}
          />
          <Field
            label="Nouvelles (période)"
            type="number"
            value={manual.odooAutomations.newThisPeriod}
            onChange={(v) => num("odooAutomations", "newThisPeriod", v)}
          />
          <Field
            label="Exécutions réussies"
            type="number"
            value={manual.odooAutomations.successfulRuns}
            onChange={(v) => num("odooAutomations", "successfulRuns", v)}
          />
          <Field
            label="Exécutions totales"
            type="number"
            value={manual.odooAutomations.totalRuns}
            onChange={(v) => num("odooAutomations", "totalRuns", v)}
          />
          <Field
            label="Notes"
            value={manual.odooAutomations.notes}
            onChange={(v) => str("odooAutomations", "notes", v)}
            wide
          />
        </Section>

        <Section title="Automatisations métier">
          <Field
            label="Actives"
            type="number"
            value={manual.businessAutomations.activeAutomations}
            onChange={(v) => num("businessAutomations", "activeAutomations", v)}
          />
          <Field
            label="Nouvelles (période)"
            type="number"
            value={manual.businessAutomations.newThisPeriod}
            onChange={(v) => num("businessAutomations", "newThisPeriod", v)}
          />
          <Field
            label="Heures économisées"
            type="number"
            value={manual.businessAutomations.estimatedHoursSaved}
            onChange={(v) =>
              num("businessAutomations", "estimatedHoursSaved", v)
            }
          />
          <Field
            label="Notes"
            value={manual.businessAutomations.notes}
            onChange={(v) => str("businessAutomations", "notes", v)}
            wide
          />
        </Section>

        <Section title="Tests de phishing">
          <Field
            label="Participants"
            type="number"
            value={manual.phishingTests.participants}
            onChange={(v) => num("phishingTests", "participants", v)}
          />
          <Field
            label="Clics"
            type="number"
            value={manual.phishingTests.clicked}
            onChange={(v) => num("phishingTests", "clicked", v)}
          />
          <Field
            label="Signalements"
            type="number"
            value={manual.phishingTests.reported}
            onChange={(v) => num("phishingTests", "reported", v)}
          />
          <Field
            label="Campagne"
            value={manual.phishingTests.campaignName}
            onChange={(v) => str("phishingTests", "campaignName", v)}
          />
          <Field
            label="Notes"
            value={manual.phishingTests.notes}
            onChange={(v) => str("phishingTests", "notes", v)}
            wide
          />
        </Section>

        <Section title="Maintenance production">
          <Field
            label="Planifiées"
            type="number"
            value={manual.productionMaintenance.plannedInterventions}
            onChange={(v) =>
              num("productionMaintenance", "plannedInterventions", v)
            }
          />
          <Field
            label="Réalisées"
            type="number"
            value={manual.productionMaintenance.completedInterventions}
            onChange={(v) =>
              num("productionMaintenance", "completedInterventions", v)
            }
          />
          <Field
            label="Incidents non planifiés"
            type="number"
            value={manual.productionMaintenance.unplannedIncidents}
            onChange={(v) =>
              num("productionMaintenance", "unplannedIncidents", v)
            }
          />
          <Field
            label="Indisponibilité (min)"
            type="number"
            value={manual.productionMaintenance.downtimeMinutes}
            onChange={(v) =>
              num("productionMaintenance", "downtimeMinutes", v)
            }
          />
          <Field
            label="Durée période (min)"
            type="number"
            value={manual.productionMaintenance.periodMinutes}
            onChange={(v) => num("productionMaintenance", "periodMinutes", v)}
          />
          <Field
            label="Notes"
            value={manual.productionMaintenance.notes}
            onChange={(v) => str("productionMaintenance", "notes", v)}
            wide
          />
        </Section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-deep)] disabled:opacity-60"
          >
            Enregistrer
          </button>
          {message && (
            <span className="text-sm text-[var(--ok)]">{message}</span>
          )}
          {error && (
            <span className="text-sm text-[var(--crit)]">{error}</span>
          )}
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="border-b border-[var(--line)] pb-2 font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
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
  type?: "text" | "number";
  wide?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}>
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
