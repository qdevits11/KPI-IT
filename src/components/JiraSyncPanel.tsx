"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { WeekSelector } from "./WeekSelector";

interface WeekOption {
  id: string;
  label: string;
}

interface ConnectionView {
  baseUrl: string;
  email: string;
  jqlBase: string;
  slaResolution: string;
  slaFirstResponse: string;
  categoryField: string;
  hasToken: boolean;
}

interface JqlPreview {
  created: string;
  openAtWeekEnd: string;
  slaResolutionBreached: string;
  slaFirstResponseBreached: string;
  start: string;
  end: string;
}

export function JiraSyncPanel({ initialWeek }: { initialWeek: string }) {
  const [weekId, setWeekId] = useState(initialWeek);
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [connected, setConnected] = useState(false);
  const [source, setSource] = useState<"account" | "env" | null>(null);
  const [connection, setConnection] = useState<ConnectionView | null>(null);
  const [jql, setJql] = useState<JqlPreview | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState({
    baseUrl: "https://.atlassian.net",
    email: "",
    apiToken: "",
    jqlBase: "project = IT",
    slaResolution: "Time to resolution",
    slaFirstResponse: "Time to first response",
    categoryField: "component" as "component" | "label" | "issuetype",
  });

  const loadMeta = useCallback(async () => {
    const [connectRes, syncRes, kpisRes] = await Promise.all([
      fetch("/api/jira/connect"),
      fetch(`/api/jira/sync?week=${encodeURIComponent(weekId)}`),
      fetch(`/api/kpis?week=${encodeURIComponent(weekId)}`),
    ]);
    const connect = await connectRes.json();
    const sync = await syncRes.json();
    const kpis = await kpisRes.json();

    setConnected(Boolean(connect.connected));
    setSource(connect.source);
    setConnection(connect.connection);
    setJql(sync.previewJql);
    setWeeks(kpis.weeks);

    if (connect.connection) {
      setForm((f) => ({
        ...f,
        baseUrl: connect.connection.baseUrl,
        email: connect.connection.email,
        jqlBase: connect.connection.jqlBase,
        slaResolution: connect.connection.slaResolution,
        slaFirstResponse: connect.connection.slaFirstResponse,
        categoryField: connect.connection.categoryField,
        apiToken: "",
      }));
    }
  }, [weekId]);

  useEffect(() => {
    startTransition(() => {
      void loadMeta();
    });
  }, [loadMeta]);

  async function connectAccount(action: "connect" | "test") {
    setResult(null);
    setError(null);
    const res = await fetch("/api/jira/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, action }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Connexion échouée");
      return;
    }
    if (action === "test") {
      setResult(`Test OK — connecté en tant que ${json.displayName}`);
      return;
    }
    setResult(`Compte Jira connecté : ${json.displayName}`);
    await loadMeta();
  }

  async function disconnect() {
    await fetch("/api/jira/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect" }),
    });
    setConnected(false);
    setConnection(null);
    setSource(null);
    setResult("Compte Jira déconnecté");
  }

  function sync(useMock: boolean) {
    setResult(null);
    setError(null);
    setWarnings([]);
    startTransition(async () => {
      const res = await fetch("/api/jira/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekId, useMock }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Sync échouée");
        return;
      }
      const w = json.dashboard.week;
      setJql(json.jql);
      setWarnings(json.warnings ?? []);
      setResult(
        `Sync ${json.mode} OK — ${w.demandesItHebdo} demandes, ${w.demandesNonResoluesHebdo} non résolues` +
          (w.ticketsHorsSlaCloture != null
            ? `, ${w.ticketsHorsSlaCloture} hors SLA clôture`
            : "") +
          (w.ticketsHorsSlaPriseEnCharge != null
            ? `, ${w.ticketsHorsSlaPriseEnCharge} hors SLA prise en charge`
            : "") +
          ".",
      );
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
            Connexion & sync Jira
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Connectez votre compte Atlassian, puis synchronisez une semaine via
            JQL (créés, non résolus, SLA, ventilations).
          </p>
        </div>
        {weeks.length > 0 && (
          <WeekSelector weeks={weeks} value={weekId} onChange={setWeekId} />
        )}
      </div>

      <section className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            Compte Jira
          </h2>
          <p className="text-sm">
            {connected ? (
              <span className="text-[var(--ok)]">
                Connecté
                {source === "env" ? " (variables d&apos;environnement)" : ""}
                {connection ? ` — ${connection.email}` : ""}
              </span>
            ) : (
              <span className="text-[var(--warn)]">Non connecté</span>
            )}
          </p>
        </div>

        <p className="text-xs text-[var(--muted)]">
          Créez un token sur{" "}
          <a
            className="text-[var(--accent)] underline"
            href="https://id.atlassian.com/manage-profile/security/api-tokens"
            target="_blank"
            rel="noreferrer"
          >
            id.atlassian.com
          </a>{" "}
          (email Atlassian + token API).
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="URL du site"
            value={form.baseUrl}
            onChange={(v) => setForm({ ...form, baseUrl: v })}
            placeholder="https://votre-domaine.atlassian.net"
          />
          <Field
            label="Email du compte"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
            placeholder="it@coverseal.com"
          />
          <Field
            label="API token"
            value={form.apiToken}
            onChange={(v) => setForm({ ...form, apiToken: v })}
            placeholder={connected ? "•••• (inchangé si vide → reconnecter)" : "Token Atlassian"}
            type="password"
          />
          <Field
            label="Filtre JQL de base"
            value={form.jqlBase}
            onChange={(v) => setForm({ ...form, jqlBase: v })}
            placeholder="project = IT"
          />
          <Field
            label="SLA clôture (nom JSM)"
            value={form.slaResolution}
            onChange={(v) => setForm({ ...form, slaResolution: v })}
          />
          <Field
            label="SLA prise en charge (nom JSM)"
            value={form.slaFirstResponse}
            onChange={(v) => setForm({ ...form, slaFirstResponse: v })}
          />
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-[var(--muted)]">Catégorie ticket</span>
            <select
              value={form.categoryField}
              onChange={(e) =>
                setForm({
                  ...form,
                  categoryField: e.target.value as typeof form.categoryField,
                })
              }
              className="rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2"
            >
              <option value="component">Composant Jira</option>
              <option value="label">Premier label</option>
              <option value="issuetype">Type de ticket</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !form.apiToken}
            onClick={() => void connectAccount("test")}
            className="rounded-md border border-[var(--line)] px-4 py-2 text-sm hover:bg-[var(--wash)] disabled:opacity-50"
          >
            Tester la connexion
          </button>
          <button
            type="button"
            disabled={pending || !form.apiToken}
            onClick={() => void connectAccount("connect")}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-deep)] disabled:opacity-50"
          >
            Connecter le compte
          </button>
          {connected && source === "account" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void disconnect()}
              className="rounded-md border border-[var(--crit)]/40 px-4 py-2 text-sm text-[var(--crit)] hover:bg-[var(--crit)]/10"
            >
              Déconnecter
            </button>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
          Synchroniser la semaine
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !connected}
            onClick={() => sync(false)}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-deep)] disabled:opacity-50"
          >
            Synchroniser depuis Jira
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => sync(true)}
            className="rounded-md border border-[var(--line)] px-4 py-2 text-sm hover:bg-[var(--wash)]"
          >
            Sync démo (mock)
          </button>
        </div>
        {result && <p className="text-sm text-[var(--ok)]">{result}</p>}
        {error && <p className="text-sm text-[var(--crit)]">{error}</p>}
        {warnings.length > 0 && (
          <ul className="space-y-1 text-xs text-[var(--warn)]">
            {warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        )}
      </section>

      {jql && (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
            JQL utilisés ({jql.start} → {jql.end})
          </h2>
          <JqlBlock label="Demandes IT (créés)" jql={jql.created} />
          <JqlBlock label="Non résolues (fin de semaine)" jql={jql.openAtWeekEnd} />
          <JqlBlock
            label="Hors SLA clôture"
            jql={jql.slaResolutionBreached}
          />
          <JqlBlock
            label="Hors SLA prise en charge"
            jql={jql.slaFirstResponseBreached}
          />
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
      />
    </label>
  );
}

function JqlBlock({ label, jql }: { label: string; jql: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--wash)] p-3">
      <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-[var(--ink)]">
        {jql}
      </pre>
    </div>
  );
}
