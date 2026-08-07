"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { AppAccessUser } from "@/lib/roles";
import { PersonAvatar } from "./PersonAvatar";

type AccessFlag = "isAdmin" | "isKpiResponsible" | "isEncodingResponsible";

function formatLoginAt(iso?: string): string {
  if (!iso) return "Jamais connecté";
  try {
    return new Date(iso).toLocaleString("fr-BE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function ConfigPanel() {
  const [accessUsers, setAccessUsers] = useState<AppAccessUser[]>([]);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessSaving, setAccessSaving] = useState(false);
  const [pending, startTransition] = useTransition();

  const loadAccess = useCallback(async () => {
    setAccessError(null);
    const res = await fetch("/api/access");
    if (!res.ok) {
      if (res.status === 403) {
        setAccessError("Réservé aux administrateurs.");
        return;
      }
      setAccessError("Chargement des utilisateurs impossible");
      return;
    }
    const data = await res.json();
    setAccessUsers(data.accessUsers ?? []);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void loadAccess();
    });
  }, [loadAccess]);

  async function saveAccessUser(user: AppAccessUser, patch: Partial<AppAccessUser>) {
    setAccessSaving(true);
    setAccessMessage(null);
    setAccessError(null);
    try {
      const res = await fetch("/api/access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          displayName: patch.displayName ?? user.displayName,
          avatarUrl: patch.avatarUrl ?? user.avatarUrl,
          isAdmin: patch.isAdmin ?? user.isAdmin,
          isKpiResponsible: patch.isKpiResponsible ?? user.isKpiResponsible,
          isEncodingResponsible:
            patch.isEncodingResponsible ?? user.isEncodingResponsible,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAccessError(data.error ?? "Enregistrement échoué");
        return false;
      }
      setAccessUsers(data.accessUsers ?? []);
      setAccessMessage(`Droits mis à jour pour ${user.email}.`);
      return true;
    } finally {
      setAccessSaving(false);
    }
  }

  async function toggleAccessFlag(
    user: AppAccessUser,
    flag: AccessFlag,
    value: boolean,
  ) {
    await saveAccessUser(user, { [flag]: value });
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
      setAccessMessage(`${email} retiré(e) de la liste.`);
    } finally {
      setAccessSaving(false);
    }
  }

  const accessBusy = pending || accessSaving;
  const adminCount = accessUsers.filter((u) => u.isAdmin).length;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
          Utilisateurs & droits
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Personnes qui se sont connectées. Cochez les droits à attribuer —
          aucune autre liste à maintenir.
        </p>
      </header>

      <section className="space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7">
        <div className="grid gap-3 text-sm text-[var(--muted)] sm:grid-cols-3">
          <p>
            <strong className="font-medium text-[var(--ink-soft)]">
              Administrateur
            </strong>{" "}
            — accès aux pages Admin.
          </p>
          <p>
            <strong className="font-medium text-[var(--ink-soft)]">
              Responsable KPI
            </strong>{" "}
            — peut saisir le retour sur la semaine (accueil).
          </p>
          <p>
            <strong className="font-medium text-[var(--ink-soft)]">
              Responsable d&apos;encodage
            </strong>{" "}
            — apparaît dans le sélecteur d&apos;encodage manuel.
          </p>
        </div>

        <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] bg-[var(--paper)]">
          {accessUsers.length === 0 && (
            <li className="px-4 py-3 text-sm text-[var(--muted)]">
              Aucun utilisateur pour l’instant. Dès qu’une personne se connecte,
              elle apparaît ici.
            </li>
          )}
          {accessUsers.map((user) => (
            <li
              key={user.email}
              className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <PersonAvatar
                  name={user.displayName || user.email}
                  avatarUrl={user.avatarUrl}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--ink)]">
                    {user.displayName || user.email}
                  </p>
                  {user.displayName ? (
                    <p className="truncate text-xs text-[var(--muted)]">
                      {user.email}
                    </p>
                  ) : null}
                  <p className="text-[11px] text-[var(--muted)]">
                    {formatLoginAt(user.lastLoginAt)}
                  </p>
                </div>
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
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={user.isEncodingResponsible}
                    disabled={accessBusy}
                    onChange={(e) =>
                      void toggleAccessFlag(
                        user,
                        "isEncodingResponsible",
                        e.target.checked,
                      )
                    }
                    className="size-4 rounded border-[var(--line)] accent-[var(--accent)]"
                  />
                  Responsable d&apos;encodage
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

        <p className="text-xs text-[var(--muted)]">
          Les responsables d&apos;encodage alimentent l&apos;encodage manuel
          depuis l&apos;{" "}
          <Link href="/" className="text-[var(--accent)] hover:underline">
            Accueil
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
