"use client";

import { useMemo, useState } from "react";
import type {
  OpenTicketsSnapshot,
  TicketListItem,
} from "@/lib/jira-tickets";
import {
  TicketDrilldown,
  type DrilldownQuery,
} from "./TicketDrilldown";
import { PersonLabel } from "./PersonAvatar";
import { usePeopleAvatars } from "./PeopleProvider";

function formatAge(days: number): string {
  if (days <= 0) return "< 1 j";
  if (days === 1) return "1 j";
  if (days < 14) return `${days} j`;
  const weeks = Math.floor(days / 7);
  const rem = days % 7;
  return rem ? `${weeks} sem. ${rem} j` : `${weeks} sem.`;
}

type DrillState = {
  query: DrilldownQuery;
  tickets?: TicketListItem[];
};

/**
 * Classement compact des tickets ouverts par personne (cliquable → drilldown).
 */
export function OpenTicketsByPerson({
  data,
  onDrill,
}: {
  data: OpenTicketsSnapshot;
  /** Si fourni, le parent gère le drilldown (sinon modal interne). */
  onDrill?: (query: DrilldownQuery, tickets?: TicketListItem[]) => void;
}) {
  const [filterName, setFilterName] = useState("");
  const [internalDrill, setInternalDrill] = useState<DrillState | null>(null);
  const { avatarUrl } = usePeopleAvatars();

  const groups = useMemo(() => {
    const q = filterName.trim().toLowerCase();
    const list = q
      ? data.byAssignee.filter((g) => g.name.toLowerCase().includes(q))
      : data.byAssignee;
    return [...list].sort((a, b) => b.count - a.count);
  }, [data, filterName]);

  const maxCount = Math.max(...groups.map((g) => g.count), 1);

  function openDrill(query: DrilldownQuery, tickets?: TicketListItem[]) {
    if (onDrill) {
      onDrill(query, tickets);
      return;
    }
    setInternalDrill({ query, tickets });
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-base text-[var(--ink)]">
          Ouverts par personne
        </h2>
        <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          Filtrer
          <input
            type="search"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            placeholder="Nom…"
            className="w-28 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink)] sm:w-36"
          />
        </label>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Aucun ticket ouvert pour ces filtres.
        </p>
      ) : (
        <ol className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          {groups.map((g, index) => {
            const photo = g.avatarUrl || avatarUrl(g.name);
            const isUnassigned = g.name === "Non assigné";
            const pct = (g.count / maxCount) * 100;
            return (
              <li key={g.name} className="border-b border-[var(--line)]/50 last:border-0">
                <button
                  type="button"
                  onClick={() =>
                    openDrill(
                      { scope: "open", assignee: g.name },
                      g.tickets,
                    )
                  }
                  className={`grid w-full grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--wash)] ${
                    isUnassigned ? "bg-[var(--warn)]/5" : ""
                  }`}
                >
                  <span
                    className={`text-xs tabular-nums ${
                      index < 3
                        ? "font-medium text-[var(--ink)]"
                        : "text-[var(--muted)]"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <PersonLabel
                        name={g.name}
                        avatarUrl={photo}
                        size="xs"
                        className={`min-w-0 truncate text-sm ${
                          isUnassigned
                            ? "font-medium text-[var(--ink)]"
                            : "text-[var(--ink)]"
                        }`}
                      />
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded bg-[var(--wash)]">
                      <div
                        className={`h-full rounded ${
                          isUnassigned
                            ? "bg-[var(--warn)]"
                            : "bg-[var(--accent)]"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                      moy. {formatAge(g.avgAgeDays)} · max{" "}
                      {formatAge(g.oldestAgeDays)}
                    </p>
                  </div>
                  <span
                    className={`tabular-nums text-sm font-medium ${
                      isUnassigned
                        ? "text-[var(--warn)]"
                        : "text-[var(--accent-deep)]"
                    }`}
                  >
                    {g.count}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {data.warnings.length > 0 && (
        <ul className="space-y-1 text-xs text-[var(--muted)]">
          {data.warnings.slice(0, 3).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {!onDrill && internalDrill && (
        <TicketDrilldown
          query={internalDrill.query}
          presetTickets={internalDrill.tickets}
          onClose={() => setInternalDrill(null)}
        />
      )}
    </section>
  );
}
