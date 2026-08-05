"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";

export function ConfigPanel() {
  const [responsibles, setResponsibles] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/settings");
    if (!res.ok) {
      setError("Chargement impossible");
      return;
    }
    const data = await res.json();
    setResponsibles(data.responsibles ?? []);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Ajout échoué");
        return;
      }
      setResponsibles(data.responsibles);
      setName("");
      setMessage(`${name.trim()} ajouté(e) à la liste.`);
    } finally {
      setSaving(false);
    }
  }

  async function removePerson(person: string) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", name: person }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Suppression échouée");
        return;
      }
      setResponsibles(data.responsibles);
      setMessage(`${person} retiré(e).`);
    } finally {
      setSaving(false);
    }
  }

  const busy = pending || saving;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
          Configuration
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Gérez les personnes autorisées comme responsable à l&apos;encodage.
          Seules ces personnes apparaissent dans le formulaire.
        </p>
      </header>

      <section className="space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            Responsables
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Utilisés pour les automatisations métiers, Odoo et maintenances.
          </p>
        </div>

        <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] bg-[var(--paper)]">
          {responsibles.length === 0 && (
            <li className="px-4 py-3 text-sm text-[var(--muted)]">
              Aucune personne — ajoutez-en au moins une.
            </li>
          )}
          {responsibles.map((person) => (
            <li
              key={person}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-[var(--ink)]"
            >
              <span className="font-medium">{person}</span>
              <button
                type="button"
                disabled={busy || responsibles.length <= 1}
                onClick={() => void removePerson(person)}
                className="text-xs text-[var(--crit)] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                title={
                  responsibles.length <= 1
                    ? "Il faut au moins un responsable"
                    : `Retirer ${person}`
                }
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>

        <form onSubmit={addPerson} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5 text-sm">
            <span className="font-medium text-[var(--ink-soft)]">
              Ajouter une personne
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Prénom"
              required
              className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-base text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-deep)] disabled:opacity-60"
          >
            {busy ? "…" : "Ajouter"}
          </button>
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

        <p className="text-xs text-[var(--muted)]">
          Voir aussi{" "}
          <Link href="/saisie" className="text-[var(--accent)] hover:underline">
            Encodage
          </Link>{" "}
          pour utiliser cette liste.
        </p>
      </section>
    </div>
  );
}
