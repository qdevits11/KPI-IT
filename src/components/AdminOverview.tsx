"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";

interface StorageInfo {
  backend: "supabase" | "blob" | "disk";
  ok: boolean;
  updatedAt: string | null;
  weeks: number | null;
  assigneeWeeks: number | null;
  requesterWeeks: number | null;
  error?: string;
}

export function AdminOverview() {
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [authLabel, setAuthLabel] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [storageRes, connectRes] = await Promise.all([
      fetch("/api/storage"),
      fetch("/api/jira/connect"),
    ]);
    const storageJson = await storageRes.json().catch(() => null);
    const connectJson = await connectRes.json().catch(() => null);
    if (storageJson?.backend) setStorage(storageJson);
    setConnected(Boolean(connectJson?.connected));
    const conn = connectJson?.connection;
    setAuthLabel(
      connectJson?.connected
        ? [
            connectJson.authMode === "oauth" ? "OAuth" : "API token",
            connectJson.source,
            conn?.accountDisplayName || conn?.email,
          ]
            .filter(Boolean)
            .join(" · ")
        : "Non configuré",
    );
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  async function resetDatabase() {
    if (
      !window.confirm(
        "Effacer toutes les données KPI (semaines, journaux, ventilations) ?\nCette action est irréversible. La connexion Jira n’est pas touchée.",
      )
    ) {
      return;
    }
    setResetting(true);
    setResetMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Réinitialisation échouée");
        return;
      }
      setResetMsg("Base réinitialisée (vide). Relancez une sync Jira.");
      await load();
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
          Administration
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Santé du système, intégration Jira, opérations de données et
          documentation des formules.
        </p>
      </div>

      {pending && !storage && (
        <p className="text-sm text-[var(--muted)]">Chargement…</p>
      )}
      {error && (
        <p className="rounded-md border border-[var(--crit)]/30 bg-[var(--crit)]/10 px-3 py-2 text-sm text-[var(--crit)]">
          {error}
        </p>
      )}
      {resetMsg && (
        <p className="rounded-md border border-[var(--ok)]/30 bg-[var(--ok)]/10 px-3 py-2 text-sm text-[var(--ok)]">
          {resetMsg}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
            Persistance
          </h2>
          {storage ? (
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Backend : <strong>{storage.backend}</strong>
              {storage.ok ? " · OK" : " · problème"}
              {storage.updatedAt
                ? ` · maj ${new Date(storage.updatedAt).toLocaleString("fr-BE")}`
                : ""}
              {storage.weeks != null ? ` · ${storage.weeks} semaines` : ""}
              {storage.assigneeWeeks != null
                ? ` · ${storage.assigneeWeeks} sem. assignés`
                : ""}
              {storage.requesterWeeks != null
                ? ` · ${storage.requesterWeeks} sem. demandeurs`
                : ""}
              {storage.error ? ` — ${storage.error}` : ""}
            </p>
          ) : (
            <p className="mt-2 text-sm text-[var(--muted)]">—</p>
          )}
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
            Jira
          </h2>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            {connected ? (
              <span className="text-[var(--ok)]">Connecté — {authLabel}</span>
            ) : (
              <span className="text-[var(--warn)]">{authLabel}</span>
            )}
          </p>
          <Link
            href="/admin/jira"
            className="mt-3 inline-block text-sm text-[var(--accent-deep)] hover:underline"
          >
            Configurer l’intégration →
          </Link>
        </section>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            href: "/admin/personnes",
            title: "Personnes & droits",
            desc: "Admins, responsables KPI, liste d’encodage",
          },
          {
            href: "/admin/jira",
            title: "Intégration Jira",
            desc: "Token, JQL, champs, seuils SLA",
          },
          {
            href: "/admin/operations",
            title: "Opérations",
            desc: "Sync semaine, import ventilations",
          },
          {
            href: "/admin/documentation",
            title: "Documentation",
            desc: "Formules et sources des KPI",
          },
        ].map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--accent)] hover:bg-[var(--wash)]"
          >
            <h3 className="font-[family-name:var(--font-display)] text-base text-[var(--ink)]">
              {card.title}
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">{card.desc}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-xl border border-[var(--crit)]/30 bg-[var(--surface)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--crit)]">
          Zone destructive
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Remet la base KPI à vide. Les credentials Jira (table séparée) sont
          conservés.
        </p>
        <button
          type="button"
          disabled={resetting}
          onClick={() => void resetDatabase()}
          className="mt-4 rounded-md border border-[var(--crit)]/40 px-4 py-2 text-sm text-[var(--crit)] disabled:opacity-50"
        >
          {resetting ? "Réinitialisation…" : "Réinitialiser la base"}
        </button>
      </section>
    </div>
  );
}
