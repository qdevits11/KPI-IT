"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type {
  AssigneeOpenGroup,
  OpenTicketsSnapshot,
  TicketListItem,
} from "@/lib/jira-tickets";
import {
  ClickableCount,
  TicketDrilldown,
  type DrilldownQuery,
} from "./TicketDrilldown";

interface OpenResponse extends OpenTicketsSnapshot {
  ok: boolean;
  error?: string;
  configured?: boolean;
}

function formatAge(days: number): string {
  if (days <= 0) return "< 1 j";
  if (days === 1) return "1 j";
  if (days < 14) return `${days} j`;
  const weeks = Math.floor(days / 7);
  const rem = days % 7;
  return rem ? `${weeks} sem. ${rem} j` : `${weeks} sem.`;
}

function formatFetchedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-BE", {
      timeZone: "Europe/Brussels",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function PersonPanel({
  group,
  onDrill,
}: {
  group: AssigneeOpenGroup;
  onDrill: (query: DrilldownQuery, tickets?: TicketListItem[]) => void;
}) {
  const [open, setOpen] = useState(group.name === "Non assigné");
  const typeEntries = Object.entries(group.byType).sort((a, b) => b[1] - a[1]);
  const maxType = Math.max(...typeEntries.map(([, n]) => n), 1);

  return (
    <li className="rounded-xl border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="font-medium text-[var(--ink)]">{group.name}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Âge moy. {formatAge(group.avgAgeDays)} · plus ancien{" "}
            {formatAge(group.oldestAgeDays)}
            <span className="ml-2 text-[var(--muted)]">{open ? "▾" : "▸"}</span>
          </p>
        </button>
        <ClickableCount
          value={group.count}
          className="text-lg font-medium"
          onClick={() =>
            onDrill({ scope: "open", assignee: group.name }, group.tickets)
          }
        />
      </div>

      {open && (
        <div className="space-y-4 border-t border-[var(--line)] px-4 py-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              Types de tickets
            </p>
            <ul className="space-y-1.5">
              {typeEntries.map(([type, count]) => (
                <li
                  key={type}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm"
                >
                  <div>
                    <div className="flex justify-between gap-2">
                      <span className="text-[var(--ink-soft)]">{type}</span>
                      <ClickableCount
                        value={count}
                        onClick={() =>
                          onDrill(
                            { scope: "open", assignee: group.name, type },
                            group.tickets.filter((t) => t.type === type),
                          )
                        }
                      />
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-[var(--wash)]">
                      <div
                        className="h-full rounded bg-[var(--accent)]"
                        style={{ width: `${(count / maxType) * 100}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-[0.1em] text-[var(--muted)]">
                  <th className="py-1.5 pr-3 font-medium">Ticket</th>
                  <th className="py-1.5 pr-3 font-medium">Type</th>
                  <th className="py-1.5 pr-3 font-medium">Ouvert depuis</th>
                  <th className="py-1.5 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {group.tickets.map((t) => (
                  <tr
                    key={t.key}
                    className="border-b border-[var(--line)]/40 last:border-0"
                  >
                    <td className="py-1.5 pr-3 align-top">
                      <a
                        href={t.browseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[var(--accent-deep)] hover:underline"
                      >
                        {t.key}
                      </a>
                      <p className="max-w-xs text-xs text-[var(--ink-soft)] line-clamp-1">
                        {t.summary}
                      </p>
                    </td>
                    <td className="py-1.5 pr-3 align-top text-[var(--ink-soft)]">
                      {t.type}
                    </td>
                    <td className="py-1.5 pr-3 align-top tabular-nums text-[var(--ink)]">
                      {formatAge(t.ageDays)}
                    </td>
                    <td className="py-1.5 align-top text-[var(--muted)]">
                      {t.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </li>
  );
}

export function OpenTicketsView() {
  const [data, setData] = useState<OpenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [drill, setDrill] = useState<{
    query: DrilldownQuery;
    tickets?: TicketListItem[];
  } | null>(null);
  const [filterName, setFilterName] = useState("");

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/jira/open");
    const json = (await res.json()) as OpenResponse;
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Impossible de charger les tickets ouverts");
      setData(null);
      return;
    }
    setData(json);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  const groups = useMemo(() => {
    if (!data) return [];
    const q = filterName.trim().toLowerCase();
    if (!q) return data.byAssignee;
    return data.byAssignee.filter((g) => g.name.toLowerCase().includes(q));
  }, [data, filterName]);

  function openDrill(query: DrilldownQuery, tickets?: TicketListItem[]) {
    setDrill({ query, tickets });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
            Instant T · Jira live
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--ink)] sm:text-4xl">
            Tickets ouverts
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Stock actuel des tickets non résolus : non attribués, charge par
            personne, types et ancienneté. Cliquez un nombre pour affiner.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data?.fetchedAt && (
            <p className="text-xs text-[var(--muted)]">
              Au {formatFetchedAt(data.fetchedAt)}
            </p>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(() => {
                void load();
              })
            }
            className="rounded-md bg-[var(--ink)] px-3 py-1.5 text-sm text-[var(--paper)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Chargement…" : "Actualiser"}
          </button>
        </div>
      </div>

      {error && (
        <div className="space-y-2 rounded-md border border-[var(--crit)]/30 bg-[var(--crit)]/10 px-3 py-3 text-sm text-[var(--crit)]">
          <p>{error}</p>
          <Link
            href="/jira"
            className="inline-block text-[var(--accent-deep)] underline-offset-2 hover:underline"
          >
            Ouvrir Sync Jira →
          </Link>
        </div>
      )}

      {pending && !data && (
        <p className="text-sm text-[var(--muted)]">Lecture Jira…</p>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                Ouverts au total
              </p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-4xl tabular-nums text-[var(--ink)]">
                <ClickableCount
                  value={data.total}
                  className="text-4xl"
                  onClick={() =>
                    openDrill({ scope: "open" }, data.tickets)
                  }
                />
              </p>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                Non attribués
              </p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-4xl tabular-nums text-[var(--ink)]">
                <ClickableCount
                  value={data.unassigned}
                  className="text-4xl"
                  onClick={() =>
                    openDrill(
                      { scope: "open", assignee: "Non assigné" },
                      data.tickets.filter((t) => t.assignee === "Non assigné"),
                    )
                  }
                />
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
              Par personne
            </h2>
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              Filtrer
              <input
                type="search"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                placeholder="Nom…"
                className="w-40 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[var(--ink)]"
              />
            </label>
          </div>

          {groups.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Aucun ticket ouvert pour ces filtres.
            </p>
          ) : (
            <ul className="space-y-3">
              {groups.map((g) => (
                <PersonPanel key={g.name} group={g} onDrill={openDrill} />
              ))}
            </ul>
          )}

          {data.warnings.length > 0 && (
            <ul className="space-y-1 text-xs text-[var(--muted)]">
              {data.warnings.slice(0, 5).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </>
      )}

      {drill && (
        <TicketDrilldown
          query={drill.query}
          presetTickets={drill.tickets}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}
