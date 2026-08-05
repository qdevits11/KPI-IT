"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { AppAccessUser } from "@/lib/roles";

export function ConfigPanel() {
  const [responsibles, setResponsibles] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const [accessUsers, setAccessUsers] = useState<AppAccessUser[]>([]);
  const [accessEmail, setAccessEmail] = useState("");
  const [accessDisplayName, setAccessDisplayName] = useState("");
  const [accessIsAdmin, setAccessIsAdmin] = useState(false);
  const [accessIsKpi, setAccessIsKpi] = useState(false);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessSaving, setAccessSaving] = useState(false);

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

  const loadAccess = useCallback(async () => {
    setAccessError(null);
    const res = await fetch("/api/access");
    if (!res.ok) {
      if (res.status === 403) {
        setAccessError("Réservé aux administrateurs.");
        return;
      }
      setAccessError("Chargement des droits impossible");
      return;
    }
    const data = await res.json();
    setAccessUsers(data.accessUsers ?? []);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
      void loadAccess();
    });
  }, [load, loadAccess]);

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

  async function saveAccessUser(
    email: string,
    flags: { isAdmin: boolean; isKpiResponsible: boolean; displayName?: string },
  ) {
    setAccessSaving(true);
    setAccessMessage(null);
    setAccessError(null);
    try {
      const res = await fetch("/api/access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          displayName: flags.displayName,
          isAdmin: flags.isAdmin,
          isKpiResponsible: flags.isKpiResponsible,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAccessError(data.error ?? "Enregistrement échoué");
        return false;
      }
      setAccessUsers(data.accessUsers ?? []);
      setAccessMessage(`Droits mis à jour pour ${email}.`);
      return true;
    } finally {
      setAccessSaving(false);
    }
  }

  async function addAccessUser(e: React.FormEvent) {
    e.preventDefault();
    if (!accessEmail.trim()) return;
    if (!accessIsAdmin && !accessIsKpi) {
      setAccessError(
        "Cochez au moins un droit (Administrateur ou Responsable KPI).",
      );
      return;
    }
    const ok = await saveAccessUser(accessEmail.trim(), {
      isAdmin: accessIsAdmin,
      isKpiResponsible: accessIsKpi,
      displayName: accessDisplayName.trim() || undefined,
    });
    if (ok) {
      setAccessEmail("");
      setAccessDisplayName("");
      setAccessIsAdmin(false);
      setAccessIsKpi(false);
    }
  }

  async function toggleAccessFlag(
    user: AppAccessUser,
    flag: "isAdmin" | "isKpiResponsible",
    value: boolean,
  ) {
    const next = {
      isAdmin: flag === "isAdmin" ? value : user.isAdmin,
      isKpiResponsible:
        flag === "isKpiResponsible" ? value : user.isKpiResponsible,
      displayName: user.displayName,
    };
    if (!next.isAdmin && !next.isKpiResponsible) {
      setAccessError(
        "Cochez au moins un droit, ou retirez l’utilisateur de la liste.",
      );
      return;
    }
    await saveAccessUser(user.email, next);
  }

  async function removeAccess(email: string) {
    setAccessSaving(true);
    setAccessMessage(null);
    setAccessError(null);
    try {
      const res = await fetch(
        `/api/access?email=${encodeURIComponent(email)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) {
        setAccessError(data.error ?? "Suppression échouée");
        return;
      }
      setAccessUsers(data.accessUsers ?? []);
      setAccessMessage(`${email} retiré(e) des droits.`);
    } finally {
      setAccessSaving(false);
    }
  }

  const busy = pending || saving;
  const accessBusy = pending || accessSaving;
  const adminCount = accessUsers.filter((u) => u.isAdmin).length;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
          Personnes & droits
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Responsables d&apos;encodage manuel et droits d&apos;accès
          (administrateur / responsable KPI).
        </p>
      </header>

      <section className="space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            Droits d&apos;accès
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Cases à cocher indépendantes : une personne peut être{" "}
            <strong className="font-medium text-[var(--ink-soft)]">
              Administrateur
            </strong>{" "}
            (pages Admin) et/ou{" "}
            <strong className="font-medium text-[var(--ink-soft)]">
              Responsable KPI
            </strong>{" "}
            (Encodage → Retour sur la semaine).
          </p>
        </div>

        <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] bg-[var(--paper)]">
          {accessUsers.length === 0 && (
            <li className="px-4 py-3 text-sm text-[var(--muted)]">
              Aucun droit défini — le bootstrap admin s&apos;appliquera au
              prochain chargement.
            </li>
          )}
          {accessUsers.map((user) => (
            <li
              key={user.email}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--ink)]">
                  {user.displayName || user.email}
                </p>
                {user.displayName ? (
                  <p className="truncate text-xs text-[var(--muted)]">
                    {user.email}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--ink)]">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={user.isAdmin}
                    disabled={accessBusy}
                    onChange={(e) =>
                      void toggleAccessFlag(user, "isAdmin", e.target.checked)
                    }
                    className="size-4 rounded border-[var(--line)] accent-[var(--accent)]"
                  />
                  Administrateur
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={user.isKpiResponsible}
                    disabled={accessBusy}
                    onChange={(e) =>
                      void toggleAccessFlag(
                        user,
                        "isKpiResponsible",
                        e.target.checked,
                      )
                    }
                    className="size-4 rounded border-[var(--line)] accent-[var(--accent)]"
                  />
                  Responsable KPI
                </label>
                <button
                  type="button"
                  disabled={accessBusy || (user.isAdmin && adminCount <= 1)}
                  onClick={() => void removeAccess(user.email)}
                  className="text-xs text-[var(--crit)] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                  title={
                    user.isAdmin && adminCount <= 1
                      ? "Il faut au moins un administrateur"
                      : `Retirer ${user.email}`
                  }
                >
                  Retirer
                </button>
              </div>
            </li>
          ))}
        </ul>

        <form
          onSubmit={addAccessUser}
          className="space-y-3 rounded-lg border border-dashed border-[var(--line)] bg-[var(--paper)]/60 p-4"
        >
          <p className="text-sm font-medium text-[var(--ink-soft)]">
            Ajouter ou mettre à jour un email
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="text-[var(--muted)]">Email</span>
              <input
                type="email"
                value={accessEmail}
                onChange={(e) => setAccessEmail(e.target.value)}
                placeholder="prenom@coverseal.com"
                required
                className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-base text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm">
              <span className="text-[var(--muted)]">Nom (optionnel)</span>
              <input
                type="text"
                value={accessDisplayName}
                onChange={(e) => setAccessDisplayName(e.target.value)}
                placeholder="Prénom Nom"
                className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-base text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--ink)]">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={accessIsAdmin}
                onChange={(e) => setAccessIsAdmin(e.target.checked)}
                className="size-4 rounded border-[var(--line)] accent-[var(--accent)]"
              />
              Administrateur
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={accessIsKpi}
                onChange={(e) => setAccessIsKpi(e.target.checked)}
                className="size-4 rounded border-[var(--line)] accent-[var(--accent)]"
              />
              Responsable KPI
            </label>
            <button
              type="submit"
              disabled={
                accessBusy ||
                !accessEmail.trim() ||
                (!accessIsAdmin && !accessIsKpi)
              }
              className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-deep)] disabled:opacity-60"
            >
              {accessBusy ? "…" : "Enregistrer"}
            </button>
          </div>
        </form>

        {accessMessage && (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-[var(--ok)]">
            {accessMessage}
          </p>
        )}
        {accessError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--crit)]">
            {accessError}
          </p>
        )}
      </section>

      <section className="space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            Responsables d&apos;encodage
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Uniquement le formulaire d&apos;encodage (automatisations, Odoo,
            maintenances). Sans lien avec les tickets Jira ni avec les droits
            ci-dessus.
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
