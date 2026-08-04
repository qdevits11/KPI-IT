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
  openStatusJql: string;
  datePriseEnChargeJql: string;
  datePriseEnChargeFieldId: string;
  slaPriseEnChargeHours: number;
  slaClotureHours: number;
  categoryField: string;
  hasToken: boolean;
}

interface JqlPreview {
  created: string;
  open: string;
  priseEnCharge: string;
  resolved: string;
  start: string;
  endExclusive: string;
  endInclusive: string;
  usedRelativeWeekFunctions?: boolean;
}

const DEFAULT_FORM = {
  baseUrl: "https://coverseal.atlassian.net",
  email: "",
  apiToken: "",
  jqlBase: "project = CSD",
  openStatusJql: "status NOT IN (Partenaire, Canceled, Done)",
  datePriseEnChargeJql: "Date Prise en Charge",
  datePriseEnChargeFieldId: "customfield_10284",
  slaPriseEnChargeHours: 24,
  slaClotureHours: 48,
  categoryField: "component" as "component" | "label" | "issuetype",
};

export function JiraSyncPanel({ initialWeek }: { initialWeek: string }) {
  const [weekId, setWeekId] = useState(initialWeek);
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [connected, setConnected] = useState(false);
  const [source, setSource] = useState<"account" | "env" | null>(null);
  const [connection, setConnection] = useState<ConnectionView | null>(null);
  const [jql, setJql] = useState<JqlPreview | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<{
    createdCount: number;
    openCount: number;
    pecCandidates: number;
    resolvedCandidates: number;
    sampleCreatedKeys: string[];
  } | null>(null);
  const [probe, setProbe] = useState<{
    ok: boolean;
    count: number;
    sampleKeys: string[];
    error?: string;
  } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(DEFAULT_FORM);

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
        openStatusJql: connect.connection.openStatusJql,
        datePriseEnChargeJql: connect.connection.datePriseEnChargeJql,
        datePriseEnChargeFieldId: connect.connection.datePriseEnChargeFieldId,
        slaPriseEnChargeHours: connect.connection.slaPriseEnChargeHours,
        slaClotureHours: connect.connection.slaClotureHours,
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
    setDiagnostics(null);
    setProbe(null);
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
      setProbe(json.probe ?? null);
      setDiagnostics(json.diagnostics ?? null);
      setResult(
        `Sync ${json.mode} OK — ${w.demandesItHebdo} demandes, ${w.demandesNonResoluesHebdo} non résolues, ${w.ticketsHorsSlaCloture} hors SLA clôture (48h), ${w.ticketsHorsSlaPriseEnCharge} hors SLA prise en charge (24h).`,
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
            Calculs alignés sur le workflow n8n : projet CSD, SLA 24h / 48h en
            heures ouvrées (week-ends + jours fériés BE exclus).
          </p>
        </div>
        {weeks.length > 0 && (
          <WeekSelector weeks={weeks} value={weekId} onChange={setWeekId} />
        )}
      </div>

      <section className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-xl">
            Compte Jira
          </h2>
          <p className="text-sm">
            {connected ? (
              <span className="text-[var(--ok)]">
                Connecté
                {source === "env" ? " (env)" : ""}
                {connection ? ` — ${connection.email}` : ""}
              </span>
            ) : (
              <span className="text-[var(--warn)]">Non connecté</span>
            )}
          </p>
        </div>

        <p className="text-xs text-[var(--muted)]">
          Token API :{" "}
          <a
            className="text-[var(--accent)] underline"
            href="https://id.atlassian.com/manage-profile/security/api-tokens"
            target="_blank"
            rel="noreferrer"
          >
            id.atlassian.com
          </a>
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="URL du site"
            value={form.baseUrl}
            onChange={(v) => setForm({ ...form, baseUrl: v })}
          />
          <Field
            label="Email"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
          />
          <Field
            label="API token"
            type="password"
            value={form.apiToken}
            onChange={(v) => setForm({ ...form, apiToken: v })}
            placeholder={connected ? "••••" : "Token Atlassian"}
          />
          <Field
            label="Filtre JQL de base"
            value={form.jqlBase}
            onChange={(v) => setForm({ ...form, jqlBase: v })}
          />
          <Field
            label="JQL tickets ouverts"
            value={form.openStatusJql}
            onChange={(v) => setForm({ ...form, openStatusJql: v })}
            wide
          />
          <Field
            label='Nom JQL « Date Prise en Charge »'
            value={form.datePriseEnChargeJql}
            onChange={(v) => setForm({ ...form, datePriseEnChargeJql: v })}
          />
          <Field
            label="ID champ (customfield_…)"
            value={form.datePriseEnChargeFieldId}
            onChange={(v) => setForm({ ...form, datePriseEnChargeFieldId: v })}
          />
          <Field
            label="SLA prise en charge (h ouvrées)"
            type="number"
            value={String(form.slaPriseEnChargeHours)}
            onChange={(v) =>
              setForm({ ...form, slaPriseEnChargeHours: Number(v) || 24 })
            }
          />
          <Field
            label="SLA clôture (h ouvrées)"
            type="number"
            value={String(form.slaClotureHours)}
            onChange={(v) =>
              setForm({ ...form, slaClotureHours: Number(v) || 48 })
            }
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !form.apiToken}
            onClick={() => void connectAccount("test")}
            className="rounded-md border border-[var(--line)] px-4 py-2 text-sm hover:bg-[var(--wash)] disabled:opacity-50"
          >
            Tester
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
              onClick={() => void disconnect()}
              className="rounded-md border border-[var(--crit)]/40 px-4 py-2 text-sm text-[var(--crit)]"
            >
              Déconnecter
            </button>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-xl">
          Synchroniser la semaine
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !connected}
            onClick={() => sync(false)}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Synchroniser depuis Jira
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => sync(true)}
            className="rounded-md border border-[var(--line)] px-4 py-2 text-sm"
          >
            Sync démo
          </button>
        </div>
        {result && <p className="text-sm text-[var(--ok)]">{result}</p>}
        {error && <p className="text-sm text-[var(--crit)]">{error}</p>}
        {probe && (
          <p className="text-xs text-[var(--muted)]">
            Sonde projet :{" "}
            {probe.ok
              ? `~${probe.count} ticket(s)`
              : `échec${probe.error ? ` — ${probe.error}` : ""}`}
            {probe.sampleKeys?.length
              ? ` — ex. ${probe.sampleKeys.join(", ")}`
              : ""}
          </p>
        )}
        {diagnostics && (
          <p className="text-xs text-[var(--muted)]">
            Détail sync : créés={diagnostics.createdCount}, ouverts=
            {diagnostics.openCount}, candidats PEC=
            {diagnostics.pecCandidates}, candidats clôture=
            {diagnostics.resolvedCandidates}
            {diagnostics.sampleCreatedKeys.length
              ? ` — clés: ${diagnostics.sampleCreatedKeys.join(", ")}`
              : ""}
          </p>
        )}
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
          <h2 className="font-[family-name:var(--font-display)] text-lg">
            JQL{" "}
            {jql.usedRelativeWeekFunctions
              ? "(startOfWeek(-1) → startOfWeek(), comme n8n)"
              : `(${jql.start} → ${jql.endExclusive} exclu)`}
          </h2>
          <JqlBlock label="Demandes IT (créés)" jql={jql.created} />
          <JqlBlock label="Non résolues (snapshot ouvert)" jql={jql.open} />
          <JqlBlock
            label="Candidats SLA prise en charge (24h ouvrées)"
            jql={jql.priseEnCharge}
          />
          <JqlBlock
            label="Candidats SLA clôture (48h ouvrées)"
            jql={jql.resolved}
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
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  wide?: boolean;
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-sm ${wide ? "sm:col-span-2" : ""}`}
    >
      <span className="text-[var(--muted)]">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2 outline-none focus:border-[var(--accent)]"
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
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-xs">
        {jql}
      </pre>
    </div>
  );
}
