"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Fragment } from "react";
import type {
  TicketListItem,
  TicketSearchFilter,
} from "@/lib/jira-tickets";
import { TicketActionsPanel } from "./TicketActionsPanel";
import { PersonLabel } from "./PersonAvatar";
import { usePeopleAvatars } from "./PeopleProvider";
import { ModalPortal } from "./ModalPortal";

export type DrilldownQuery = TicketSearchFilter;

function describeFilters(filter: TicketSearchFilter): string {
  const scopeLabel =
    filter.scope === "open"
      ? filter.weekId
        ? "ouverts (fin de semaine)"
        : "ouverts (live)"
      : filter.scope === "closed"
        ? "clôturés"
        : filter.scope === "sla_pec"
          ? "hors SLA prise en charge"
          : filter.scope === "sla_cloture"
            ? "hors SLA clôture"
            : "créés";
  const bits: string[] = [scopeLabel];
  if (filter.weekId) bits.push(`semaine ${filter.weekId}`);
  else if (filter.year) bits.push(`année ${filter.year}`);
  if (filter.assignee) bits.push(`assigné : ${filter.assignee}`);
  if (filter.requester) bits.push(`demandeur : ${filter.requester}`);
  if (filter.type) bits.push(`type : ${filter.type}`);
  return bits.join(" · ");
}

interface SearchResponse {
  ok: boolean;
  error?: string;
  tickets?: TicketListItem[];
  total?: number;
  truncated?: boolean;
  jql?: string;
  warnings?: string[];
}

function formatAge(days: number): string {
  if (days <= 0) return "< 1 j";
  if (days === 1) return "1 j";
  if (days < 14) return `${days} j`;
  const weeks = Math.floor(days / 7);
  const rem = days % 7;
  return rem ? `${weeks} sem. ${rem} j` : `${weeks} sem.`;
}

function formatCreated(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-BE", {
      timeZone: "Europe/Brussels",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function buildQuery(filter: DrilldownQuery): string {
  const p = new URLSearchParams();
  p.set("scope", filter.scope);
  if (filter.assignee) p.set("assignee", filter.assignee);
  if (filter.requester) p.set("requester", filter.requester);
  if (filter.type) p.set("type", filter.type);
  if (filter.weekId) p.set("week", filter.weekId);
  if (filter.year != null) p.set("year", String(filter.year));
  return p.toString();
}

/** Panneau de détail tickets — ouvert au clic sur un nombre de rapport. */
export function TicketDrilldown({
  query,
  onClose,
  /** Tickets déjà connus (ex. snapshot ouverts) — évite un re-fetch. */
  presetTickets,
}: {
  query: DrilldownQuery;
  onClose: () => void;
  presetTickets?: TicketListItem[];
}) {
  const [tickets, setTickets] = useState<TicketListItem[]>(presetTickets ?? []);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [jql, setJql] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [pending, startTransition] = useTransition();
  const [localType, setLocalType] = useState(query.type ?? "");
  const [localAssignee, setLocalAssignee] = useState(query.assignee ?? "");
  const [localRequester, setLocalRequester] = useState(query.requester ?? "");
  const [textQuery, setTextQuery] = useState("");
  const [actionKey, setActionKey] = useState<string | null>(null);
  const { avatarUrl } = usePeopleAvatars();

  const load = useCallback(async (filter: DrilldownQuery) => {
    setError(null);
    const res = await fetch(`/api/jira/tickets?${buildQuery(filter)}`);
    const json = (await res.json()) as SearchResponse;
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Impossible de charger les tickets");
      setTickets([]);
      return;
    }
    setTickets(json.tickets ?? []);
    setWarnings(json.warnings ?? []);
    setJql(json.jql ?? null);
    setTruncated(Boolean(json.truncated));
  }, []);

  useEffect(() => {
    if (presetTickets) {
      setTickets(presetTickets);
      return;
    }
    startTransition(() => {
      void load(query);
    });
  }, [query, load, presetTickets]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const typeOptions = useMemo(() => {
    const set = new Set(tickets.map((t) => t.type));
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [tickets]);

  const assigneeOptions = useMemo(() => {
    const set = new Set(tickets.map((t) => t.assignee));
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [tickets]);

  const requesterOptions = useMemo(() => {
    const set = new Set(tickets.map((t) => t.requester));
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = textQuery.trim().toLowerCase();
    return tickets.filter((t) => {
      if (localType && t.type !== localType) return false;
      if (localAssignee && t.assignee !== localAssignee) return false;
      if (localRequester && t.requester !== localRequester) return false;
      if (!q) return true;
      return (
        t.key.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q) ||
        t.assignee.toLowerCase().includes(q) ||
        t.requester.toLowerCase().includes(q)
      );
    });
  }, [tickets, localType, localAssignee, localRequester, textQuery]);

  const title = describeFilters(query);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--ink)]/40 p-0 sm:items-center sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drilldown-title"
        onClick={onClose}
      >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-t-2xl border border-[var(--line)] bg-[var(--paper)] shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
              Détail tickets
            </p>
            <h2
              id="drilldown-title"
              className="mt-1 font-[family-name:var(--font-display)] text-lg text-[var(--ink)] sm:text-xl"
            >
              {title}
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {pending && !presetTickets
                ? "Chargement depuis Jira…"
                : `${filtered.length} ticket${filtered.length > 1 ? "s" : ""}`}
              {truncated ? " (liste potentiellement tronquée)" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--line)] px-2.5 py-1 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Fermer
          </button>
        </header>

        <div className="flex flex-wrap gap-2 border-b border-[var(--line)] bg-[var(--wash)]/40 px-4 py-3 sm:px-5">
          <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            Recherche
            <input
              type="search"
              value={textQuery}
              onChange={(e) => setTextQuery(e.target.value)}
              placeholder="Clé, titre…"
              className="w-36 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--ink)] sm:w-44"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            Type
            <select
              value={localType}
              onChange={(e) => setLocalType(e.target.value)}
              className="max-w-[10rem] rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--ink)]"
            >
              <option value="">Tous</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            Assigné
            <select
              value={localAssignee}
              onChange={(e) => setLocalAssignee(e.target.value)}
              className="max-w-[10rem] rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--ink)]"
            >
              <option value="">Tous</option>
              {assigneeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            Demandeur
            <select
              value={localRequester}
              onChange={(e) => setLocalRequester(e.target.value)}
              className="max-w-[10rem] rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--ink)]"
            >
              <option value="">Tous</option>
              {requesterOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <p className="mx-4 mt-3 rounded-md border border-[var(--crit)]/30 bg-[var(--crit)]/10 px-3 py-2 text-sm text-[var(--crit)] sm:mx-5">
            {error}
          </p>
        )}
        {warnings.length > 0 && (
          <ul className="mx-4 mt-2 space-y-1 text-xs text-[var(--muted)] sm:mx-5">
            {warnings.slice(0, 3).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        <div className="min-h-0 flex-1 overflow-auto px-2 py-2 sm:px-3">
          {filtered.length === 0 && !pending ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--muted)]">
              Aucun ticket pour ces filtres.
            </p>
          ) : (
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-[0.1em] text-[var(--muted)]">
                  <th className="px-2 py-2 font-medium">Ticket</th>
                  <th className="px-2 py-2 font-medium">Type</th>
                  <th className="px-2 py-2 font-medium">Assigné</th>
                  <th className="px-2 py-2 font-medium">Demandeur</th>
                  <th className="px-2 py-2 font-medium">Créé</th>
                  <th className="px-2 py-2 font-medium">Âge</th>
                  <th className="px-2 py-2 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <Fragment key={t.key}>
                    <tr className="border-b border-[var(--line)]/50 hover:bg-[var(--wash)]/50">
                      <td className="px-2 py-2 align-top">
                        <a
                          href={t.browseUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-[var(--accent-deep)] hover:underline"
                        >
                          {t.key}
                        </a>
                        <p className="mt-0.5 max-w-xs text-xs text-[var(--ink-soft)] line-clamp-2">
                          {t.summary}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setActionKey((k) => (k === t.key ? null : t.key))
                          }
                          className="mt-1 text-xs font-medium text-[var(--accent-deep)] hover:underline"
                        >
                          {actionKey === t.key ? "Masquer actions" : "Gérer"}
                        </button>
                      </td>
                      <td className="px-2 py-2 align-top text-[var(--ink-soft)]">
                        {t.type}
                      </td>
                      <td className="px-2 py-2 align-top text-[var(--ink-soft)]">
                        <PersonLabel
                          name={t.assignee}
                          avatarUrl={t.assigneeAvatarUrl || avatarUrl(t.assignee)}
                          size="xs"
                        />
                      </td>
                      <td className="px-2 py-2 align-top text-[var(--ink-soft)]">
                        <PersonLabel
                          name={t.requester}
                          avatarUrl={
                            t.requesterAvatarUrl || avatarUrl(t.requester)
                          }
                          size="xs"
                        />
                      </td>
                      <td className="px-2 py-2 align-top tabular-nums text-[var(--muted)]">
                        {formatCreated(t.created)}
                      </td>
                      <td className="px-2 py-2 align-top tabular-nums text-[var(--ink)]">
                        {formatAge(t.ageDays)}
                      </td>
                      <td className="px-2 py-2 align-top text-[var(--muted)]">
                        {t.status}
                      </td>
                    </tr>
                    {actionKey === t.key && (
                      <tr className="border-b border-[var(--line)]/50">
                        <td colSpan={7} className="px-2 py-2">
                          <TicketActionsPanel issueKey={t.key} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {jql && (
          <footer className="border-t border-[var(--line)] px-4 py-2 text-[10px] text-[var(--muted)] sm:px-5">
            <span className="font-medium">JQL · </span>
            <code className="break-all">{jql}</code>
          </footer>
        )}
      </div>
      </div>
    </ModalPortal>
  );
}

/** Bouton nombre cliquable pour ouvrir le drill-down. */
export function ClickableCount({
  value,
  onClick,
  title,
  className = "",
}: {
  value: number;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  if (!onClick || value <= 0) {
    return (
      <span className={`tabular-nums ${className}`}>
        {value.toLocaleString("fr-BE")}
      </span>
    );
  }
  return (
    <button
      type="button"
      title={title ?? "Voir les tickets"}
      onClick={onClick}
      className={`tabular-nums text-[var(--accent-deep)] underline decoration-[var(--accent)]/30 underline-offset-2 transition-colors hover:text-[var(--accent)] hover:decoration-[var(--accent)] ${className}`}
    >
      {value.toLocaleString("fr-BE")}
    </button>
  );
}
