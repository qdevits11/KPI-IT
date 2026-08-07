"use client";

import { useMemo, useState, Fragment } from "react";
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
import { TicketActionsPanel } from "./TicketActionsPanel";
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

function PersonPanel({
  group,
  onDrill,
}: {
  group: AssigneeOpenGroup;
  onDrill: (query: DrilldownQuery, tickets?: TicketListItem[]) => void;
}) {
  const [open, setOpen] = useState(group.name === "Non assigné");
  const [actionKey, setActionKey] = useState<string | null>(null);
  const { avatarUrl } = usePeopleAvatars();
  const typeEntries = Object.entries(group.byType).sort((a, b) => b[1] - a[1]);
  const maxType = Math.max(...typeEntries.map(([, n]) => n), 1);
  const photo = group.avatarUrl || avatarUrl(group.name);

  return (
    <li className="rounded-xl border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <PersonLabel
            name={group.name}
            avatarUrl={photo}
            size="md"
            className="font-medium text-[var(--ink)]"
          />
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
                  <Fragment key={t.key}>
                    <tr className="border-b border-[var(--line)]/40 last:border-0">
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
                        <button
                          type="button"
                          onClick={() =>
                            setActionKey((k) => (k === t.key ? null : t.key))
                          }
                          className="mt-1 text-xs font-medium text-[var(--accent-deep)] hover:underline"
                        >
                          {actionKey === t.key ? "Masquer" : "Gérer"}
                        </button>
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
                    {actionKey === t.key && (
                      <tr className="border-b border-[var(--line)]/40">
                        <td colSpan={4} className="py-2">
                          <TicketActionsPanel issueKey={t.key} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </li>
  );
}

type DrillState = {
  query: DrilldownQuery;
  tickets?: TicketListItem[];
};

/**
 * Liste « Par personne » des tickets ouverts (identique à l’ancienne page Tickets).
 * Gère son propre drilldown si `onDrill` n’est pas fourni.
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

  const groups = useMemo(() => {
    const q = filterName.trim().toLowerCase();
    if (!q) return data.byAssignee;
    return data.byAssignee.filter((g) => g.name.toLowerCase().includes(q));
  }, [data, filterName]);

  function openDrill(query: DrilldownQuery, tickets?: TicketListItem[]) {
    if (onDrill) {
      onDrill(query, tickets);
      return;
    }
    setInternalDrill({ query, tickets });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)] sm:text-xl">
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
