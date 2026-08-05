"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { IssueActionMeta } from "@/lib/jira-actions";

export function TicketActionsPanel({
  issueKey,
  onUpdated,
}: {
  issueKey: string;
  onUpdated?: () => void;
}) {
  const [meta, setMeta] = useState<IssueActionMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needOAuth, setNeedOAuth] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [transitionId, setTransitionId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [category, setCategory] = useState("");

  const load = useCallback(async () => {
    setError(null);
    setNeedOAuth(false);
    const res = await fetch(`/api/jira/issue/${encodeURIComponent(issueKey)}`);
    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      needOAuth?: boolean;
      meta?: IssueActionMeta;
    };
    if (!res.ok || !json.ok || !json.meta) {
      setError(json.error ?? "Impossible de charger les actions");
      setNeedOAuth(Boolean(json.needOAuth) || res.status === 401);
      setMeta(null);
      return;
    }
    setMeta(json.meta);
    setTransitionId("");
    setAccountId(json.meta.assigneeAccountId ?? "");
    setCategory(json.meta.category ?? "");
  }, [issueKey]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  function run(action: "transition" | "assign" | "category", payload: object) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/jira/issue/${encodeURIComponent(issueKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        needOAuth?: boolean;
        meta?: IssueActionMeta;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Action échouée");
        setNeedOAuth(Boolean(json.needOAuth));
        return;
      }
      if (json.meta) {
        setMeta(json.meta);
        setAccountId(json.meta.assigneeAccountId ?? "");
        setCategory(json.meta.category ?? "");
      }
      setMessage("Mis à jour dans Jira");
      onUpdated?.();
    });
  }

  if (needOAuth && !meta) {
    return (
      <div className="rounded-md border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-3 py-2 text-sm text-[var(--ink)]">
        <p>
          Les modifications de tickets nécessitent un token de synchronisation
          en OAuth (admin → Sync Jira). Votre login sert à l’identité KPI·IT ;
          la sync garde son propre compte.
        </p>
        <Link
          href="/jira"
          className="mt-2 inline-block font-medium text-[var(--accent-deep)] hover:underline"
        >
          Ouvrir Sync Jira →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--wash)]/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
          Actions Jira · {issueKey}
        </p>
        {pending && (
          <span className="text-xs text-[var(--muted)]">…</span>
        )}
      </div>

      {error && (
        <p className="text-sm text-[var(--crit)]">
          {error}{" "}
          {needOAuth && (
            <Link
              href="/jira"
              className="underline text-[var(--accent-deep)]"
            >
              Sync Jira
            </Link>
          )}
        </p>
      )}
      {message && <p className="text-sm text-[var(--ok)]">{message}</p>}

      {meta && (
        <>
          <p className="text-xs text-[var(--muted)]">
            Statut actuel : <span className="text-[var(--ink)]">{meta.status}</span>
            {" · "}
            Assigné :{" "}
            <span className="text-[var(--ink)]">{meta.assigneeName}</span>
            {meta.category ? (
              <>
                {" · "}Type :{" "}
                <span className="text-[var(--ink)]">{meta.category}</span>
              </>
            ) : null}
          </p>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              Nouveau statut
              <div className="flex gap-1">
                <select
                  value={transitionId}
                  onChange={(e) => setTransitionId(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
                >
                  <option value="">Choisir…</option>
                  {meta.transitions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.toStatus && t.toStatus !== t.name
                        ? ` → ${t.toStatus}`
                        : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending || !transitionId}
                  onClick={() =>
                    run("transition", { transitionId })
                  }
                  className="rounded-md bg-[var(--ink)] px-2 py-1 text-xs text-[var(--paper)] disabled:opacity-40"
                >
                  OK
                </button>
              </div>
            </label>

            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              Assigné
              <div className="flex gap-1">
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
                >
                  <option value="">Non assigné</option>
                  {meta.assignable.map((u) => (
                    <option key={u.accountId} value={u.accountId}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run("assign", {
                      accountId: accountId || null,
                    })
                  }
                  className="rounded-md bg-[var(--ink)] px-2 py-1 text-xs text-[var(--paper)] disabled:opacity-40"
                >
                  OK
                </button>
              </div>
            </label>

            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              Type / catégorie
              <div className="flex gap-1">
                {meta.categories.length > 0 ? (
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={!meta.canEditCategory}
                    className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
                  >
                    <option value="">Choisir…</option>
                    {meta.categories.map((c) => (
                      <option key={c.id} value={c.value}>
                        {c.value}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={!meta.canEditCategory}
                    placeholder="Valeur…"
                    className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--ink)]"
                  />
                )}
                <button
                  type="button"
                  disabled={pending || !category || !meta.canEditCategory}
                  onClick={() => run("category", { category })}
                  className="rounded-md bg-[var(--ink)] px-2 py-1 text-xs text-[var(--paper)] disabled:opacity-40"
                >
                  OK
                </button>
              </div>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
