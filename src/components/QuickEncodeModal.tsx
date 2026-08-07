"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { LogEvent, PhishingEvent } from "@/lib/types";
import { parseWeekId } from "@/lib/types";
import {
  formatFrDate,
  mondayOfIsoWeek,
  sundayOfIsoWeek,
  weekIdFromDate,
} from "@/lib/dates";
import { ModalPortal } from "./ModalPortal";

export type EncodeKind = "metier" | "odoo" | "maintenance" | "phishing";

type LogCollection =
  | "automationsMetier"
  | "automationsOdoo"
  | "maintenances"
  | "phishing";

const KIND_META: Record<
  EncodeKind,
  {
    title: string;
    collection: LogCollection;
    action?: "addMetier" | "addOdoo" | "addMaintenance";
    phishing?: boolean;
  }
> = {
  metier: {
    title: "Automatisations métier",
    collection: "automationsMetier",
    action: "addMetier",
  },
  odoo: {
    title: "Améliorations Odoo",
    collection: "automationsOdoo",
    action: "addOdoo",
  },
  maintenance: {
    title: "Maintenances production",
    collection: "maintenances",
    action: "addMaintenance",
  },
  phishing: {
    title: "Tests phishing ratés",
    collection: "phishing",
    phishing: true,
  },
};

type Mode = "list" | "add" | "edit";

type Props = {
  kind: EncodeKind;
  weekId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function QuickEncodeModal({
  kind,
  weekId,
  onClose,
  onSaved,
}: Props) {
  const titleId = useId();
  const meta = KIND_META[kind];
  const { year, week } = parseWeekId(weekId);
  const weekStart = mondayOfIsoWeek(year, week);
  const weekEnd = sundayOfIsoWeek(year, week);

  const [mode, setMode] = useState<Mode>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [items, setItems] = useState<Array<LogEvent | PhishingEvent>>([]);
  const [responsibles, setResponsibles] = useState<string[]>([]);
  const [canEncode, setCanEncode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(weekStart);
  const [explanation, setExplanation] = useState("");
  const [responsible, setResponsible] = useState("");
  const [failures, setFailures] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entriesRes, meRes] = await Promise.all([
        fetch(`/api/entries?week=${encodeURIComponent(weekId)}`),
        fetch("/api/me"),
      ]);
      if (entriesRes.ok) {
        const json = (await entriesRes.json()) as {
          automationsMetier?: LogEvent[];
          automationsOdoo?: LogEvent[];
          maintenances?: LogEvent[];
          phishing?: PhishingEvent[];
          responsibles?: string[];
        };
        const { year: y, week: w } = parseWeekId(weekId);
        const bag =
          meta.collection === "phishing"
            ? json.phishing ?? []
            : meta.collection === "automationsMetier"
              ? json.automationsMetier ?? []
              : meta.collection === "automationsOdoo"
                ? json.automationsOdoo ?? []
                : json.maintenances ?? [];
        setItems(
          bag
            .filter((e) => e.year === y && e.week === w)
            .sort((a, b) => a.date.localeCompare(b.date)),
        );
        if (Array.isArray(json.responsibles)) {
          setResponsibles(json.responsibles);
        }
      }
      if (meRes.ok) {
        const me = (await meRes.json()) as {
          permissions?: {
            isEncodingResponsible?: boolean;
            isAdmin?: boolean;
            adminPages?: boolean;
          };
        };
        setCanEncode(
          Boolean(
            me.permissions?.isEncodingResponsible ||
              me.permissions?.isAdmin ||
              me.permissions?.adminPages,
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [weekId, meta.collection]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (mode !== "list") {
          setMode("list");
          setEditingId(null);
          setError(null);
        } else {
          onClose();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onClose]);

  const defaultResponsible = useMemo(
    () => responsibles[0] ?? "",
    [responsibles],
  );

  function startAdd() {
    setMode("add");
    setEditingId(null);
    setDate(weekStart);
    setExplanation("");
    setResponsible(defaultResponsible);
    setFailures(1);
    setError(null);
  }

  function startEdit(item: LogEvent | PhishingEvent) {
    setMode("edit");
    setEditingId(item.id);
    setDate(item.date);
    if (meta.phishing) {
      setFailures((item as PhishingEvent).failures ?? 0);
      setExplanation("");
      setResponsible(defaultResponsible);
    } else {
      const log = item as LogEvent;
      setExplanation(log.explanation);
      setResponsible(log.responsible || defaultResponsible);
    }
    setError(null);
  }

  function backToList() {
    setMode("list");
    setEditingId(null);
    setError(null);
  }

  async function removeItem(eventId: string) {
    if (!canEncode) return;
    if (!window.confirm("Supprimer cette ligne ?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/entries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekId,
          action: "deleteEvent",
          collection: meta.collection,
          eventId,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Suppression échouée");
        return;
      }
      await load();
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!canEncode) {
      setError("Réservé aux responsables d’encodage.");
      return;
    }
    if (date < weekStart || date > weekEnd) {
      setError(
        `La date doit être dans la semaine ${weekId} (${formatFrDate(weekStart)} – ${formatFrDate(weekEnd)}).`,
      );
      return;
    }
    if (weekIdFromDate(date) !== weekId) {
      setError(`La date doit appartenir à la semaine ${weekId}.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (meta.phishing) {
        const body =
          mode === "edit" && editingId
            ? {
                weekId,
                action: "updateEvent" as const,
                collection: "phishing" as const,
                eventId: editingId,
                event: { date, failures },
              }
            : {
                weekId,
                action: "addPhishing" as const,
                event: { date, failures },
              };
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
      } else {
        if (!explanation.trim() || !responsible.trim()) {
          setError("Explication et responsable obligatoires.");
          return;
        }
        const body =
          mode === "edit" && editingId
            ? {
                weekId,
                action: "updateEvent" as const,
                collection: meta.collection,
                eventId: editingId,
                event: {
                  date,
                  explanation: explanation.trim(),
                  responsible: responsible.trim(),
                },
              }
            : {
                weekId,
                action: meta.action!,
                event: {
                  date,
                  explanation: explanation.trim(),
                  responsible: responsible.trim(),
                },
              };
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
      }
      await load();
      onSaved();
      backToList();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[80] flex items-end justify-center bg-[var(--ink)]/45 p-4 backdrop-blur-[2px] sm:items-center"
        role="presentation"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="flex max-h-[min(90vh,40rem)] w-full max-w-lg flex-col rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
                Encodage · {weekId}
              </p>
              <h2
                id={titleId}
                className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--ink)]"
              >
                {meta.title}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {formatFrDate(weekStart)} – {formatFrDate(weekEnd)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[var(--line)] px-2 py-1 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Fermer
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {error && (
              <p className="mb-3 rounded-md border border-[var(--crit)]/30 bg-[var(--crit)]/10 px-3 py-2 text-sm text-[var(--crit)]">
                {error}
              </p>
            )}

            {mode === "list" && (
              <div className="space-y-3">
                {loading ? (
                  <p className="text-sm text-[var(--muted)]">Chargement…</p>
                ) : items.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">
                    Aucune ligne pour cette semaine.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--line)]/60 overflow-hidden rounded-lg border border-[var(--line)]">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start justify-between gap-3 px-3 py-2.5"
                      >
                        <div className="min-w-0 text-sm">
                          <p className="tabular-nums text-xs text-[var(--muted)]">
                            {formatFrDate(item.date)}
                          </p>
                          {meta.phishing ? (
                            <p className="text-[var(--ink)]">
                              {(item as PhishingEvent).failures} échec
                              {(item as PhishingEvent).failures > 1 ? "s" : ""}
                            </p>
                          ) : (
                            <>
                              <p className="text-[var(--ink)]">
                                {(item as LogEvent).explanation}
                              </p>
                              <p className="text-xs text-[var(--muted)]">
                                {(item as LogEvent).responsible}
                              </p>
                            </>
                          )}
                        </div>
                        {canEncode && (
                          <div className="flex shrink-0 flex-col gap-1">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => startEdit(item)}
                              className="text-xs font-medium text-[var(--accent-deep)] hover:underline"
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void removeItem(item.id)}
                              className="text-xs text-[var(--crit)] hover:underline"
                            >
                              Supprimer
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {canEncode ? (
                  <button
                    type="button"
                    onClick={startAdd}
                    className="w-full rounded-md bg-[var(--ink)] px-3 py-2.5 text-sm font-medium text-[var(--paper)] hover:opacity-90"
                  >
                    Ajouter une ligne
                  </button>
                ) : (
                  <p className="text-xs text-[var(--muted)]">
                    Seuls les responsables d’encodage peuvent modifier ces
                    lignes.
                  </p>
                )}
              </div>
            )}

            {(mode === "add" || mode === "edit") && (
              <form onSubmit={(e) => void submitForm(e)} className="space-y-4">
                <p className="text-sm font-medium text-[var(--ink)]">
                  {mode === "edit" ? "Modifier la ligne" : "Nouvelle ligne"}
                </p>
                <label className="block space-y-1 text-sm">
                  <span className="text-[var(--muted)]">Date</span>
                  <input
                    type="date"
                    required
                    min={weekStart}
                    max={weekEnd}
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
                          <option value="">Aucun responsable</option>
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

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={backToList}
                    disabled={saving}
                    className="flex-1 rounded-md border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
                  >
                    Retour
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-md bg-[var(--ink)] px-3 py-2.5 text-sm font-medium text-[var(--paper)] disabled:opacity-50"
                  >
                    {saving ? "Enregistrement…" : "Enregistrer"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
