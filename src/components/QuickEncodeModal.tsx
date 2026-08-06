"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import {
  isoWeekPartsFromDate,
  todayIsoDate,
  weekIdFromDate,
} from "@/lib/dates";

export type EncodeKind = "metier" | "odoo" | "maintenance" | "phishing";

const KIND_META: Record<
  EncodeKind,
  {
    title: string;
    action?: "addMetier" | "addOdoo" | "addMaintenance";
    phishing?: boolean;
  }
> = {
  metier: { title: "Automatisation métier", action: "addMetier" },
  odoo: { title: "Amélioration Odoo", action: "addOdoo" },
  maintenance: { title: "Maintenance production", action: "addMaintenance" },
  phishing: { title: "Test phishing raté", phishing: true },
};

type Props = {
  kind: EncodeKind;
  onClose: () => void;
  onSaved: () => void;
};

export function QuickEncodeModal({ kind, onClose, onSaved }: Props) {
  const titleId = useId();
  const meta = KIND_META[kind];
  const [date, setDate] = useState(todayIsoDate());
  const [explanation, setExplanation] = useState("");
  const [responsible, setResponsible] = useState("");
  const [failures, setFailures] = useState(1);
  const [responsibles, setResponsibles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/entries?week=${encodeURIComponent(weekIdFromDate(todayIsoDate()))}`);
      if (!res.ok) return;
      const json = (await res.json()) as { responsibles?: string[] };
      if (Array.isArray(json.responsibles)) {
        setResponsibles(json.responsibles);
        if (json.responsibles[0]) setResponsible(json.responsibles[0]);
      }
    })();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const parts = isoWeekPartsFromDate(date);
      const body = meta.phishing
        ? {
            weekId: weekIdFromDate(date),
            action: "addPhishing" as const,
            event: {
              date,
              year: parts.year,
              month: parts.month,
              week: parts.week,
              failures,
            },
          }
        : {
            weekId: weekIdFromDate(date),
            action: meta.action!,
            event: {
              date,
              year: parts.year,
              month: parts.month,
              week: parts.week,
              explanation: explanation.trim(),
              responsible: responsible.trim(),
            },
          };

      if (!meta.phishing) {
        if (!explanation.trim() || !responsible.trim()) {
          setError("Explication et responsable obligatoires.");
          return;
        }
      }

      const res = await fetch("/api/entries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Enregistrement échoué");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[var(--ink)]/45 p-4 backdrop-blur-[2px] sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
              Encodage rapide
            </p>
            <h2
              id={titleId}
              className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--ink)]"
            >
              {meta.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--line)] px-2 py-1 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Fermer
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted)]">Date</span>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)]"
            />
          </label>

          {meta.phishing ? (
            <label className="block space-y-1 text-sm">
              <span className="text-[var(--muted)]">Nombre d’échecs</span>
              <input
                type="number"
                min={0}
                value={failures}
                onChange={(e) => setFailures(Number(e.target.value))}
                className="w-full rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)]"
              />
            </label>
          ) : (
            <>
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--muted)]">Explication</span>
                <textarea
                  required
                  rows={3}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  className="w-full rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)]"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--muted)]">Responsable</span>
                <select
                  required
                  value={responsible}
                  onChange={(e) => setResponsible(e.target.value)}
                  className="w-full rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)]"
                >
                  {responsibles.length === 0 && (
                    <option value="">Chargement…</option>
                  )}
                  {responsibles.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {error && (
            <p className="rounded-md border border-[var(--crit)]/30 bg-[var(--crit)]/10 px-3 py-2 text-sm text-[var(--crit)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-md bg-[var(--ink)] px-3 py-2.5 text-sm font-medium text-[var(--paper)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </form>
      </div>
    </div>
  );
}
