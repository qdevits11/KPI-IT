"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { Period } from "@/lib/types";
import { PeriodSelector } from "./PeriodSelector";

export function JiraSyncPanel({ initialPeriod }: { initialPeriod: string }) {
  const [periodId, setPeriodId] = useState(initialPeriod);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [configured, setConfigured] = useState(false);
  const [env, setEnv] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const loadMeta = useCallback(async () => {
    const [statusRes, kpisRes] = await Promise.all([
      fetch("/api/jira/sync"),
      fetch(`/api/kpis?period=${encodeURIComponent(periodId)}`),
    ]);
    const status = await statusRes.json();
    const kpis = await kpisRes.json();
    setConfigured(status.configured);
    setEnv(status.env);
    setPeriods(kpis.periods);
  }, [periodId]);

  useEffect(() => {
    startTransition(() => {
      void loadMeta();
    });
  }, [loadMeta]);

  function sync(useMock: boolean) {
    setResult(null);
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/jira/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId, useMock }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Sync échouée");
        return;
      }
      setResult(
        `Sync ${json.mode} OK — ${json.period.jira.created} créés, ${json.period.jira.resolved} résolus, ${json.period.jira.open} ouverts.`,
      );
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
            Synchronisation Jira
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Agrège les tickets créés, résolus et ouverts pour la période, puis
            calcule délai moyen et respect SLA.
          </p>
        </div>
        {periods.length > 0 && (
          <PeriodSelector
            periods={periods}
            value={periodId}
            onChange={setPeriodId}
          />
        )}
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-3">
        <p className="text-sm">
          Statut :{" "}
          <strong className={configured ? "text-[var(--ok)]" : "text-[var(--warn)]"}>
            {configured ? "Jira configuré" : "Jira non configuré (mode démo disponible)"}
          </strong>
        </p>
        {env && (
          <ul className="grid gap-1 text-xs text-[var(--muted)] sm:grid-cols-2">
            <li>JIRA_BASE_URL : {env.hasBaseUrl ? "oui" : "non"}</li>
            <li>JIRA_EMAIL : {env.hasEmail ? "oui" : "non"}</li>
            <li>JIRA_API_TOKEN : {env.hasToken ? "oui" : "non"}</li>
            <li>JQL : {String(env.jqlBase)}</li>
            <li>SLA (h) : {String(env.slaHours)}</li>
          </ul>
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            disabled={pending || !configured}
            onClick={() => sync(false)}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-deep)] disabled:opacity-50"
          >
            Synchroniser Jira
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => sync(true)}
            className="rounded-md border border-[var(--line)] px-4 py-2 text-sm text-[var(--ink)] hover:bg-[var(--wash)]"
          >
            Sync démo (mock)
          </button>
        </div>
        {result && <p className="text-sm text-[var(--ok)]">{result}</p>}
        {error && <p className="text-sm text-[var(--crit)]">{error}</p>}
      </div>

      <section className="space-y-2 text-sm text-[var(--muted)]">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
          Variables d&apos;environnement
        </h2>
        <pre className="overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--wash)] p-4 text-xs text-[var(--ink)]">
{`JIRA_BASE_URL=https://votre-domaine.atlassian.net
JIRA_EMAIL=it@coverseal.com
JIRA_API_TOKEN=***
JIRA_JQL_BASE=project = IT
JIRA_SLA_HOURS=8`}
        </pre>
      </section>
    </div>
  );
}
