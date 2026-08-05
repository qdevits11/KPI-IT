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
  categoryCustomFieldId?: string;
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

interface WeekValues {
  demandesItHebdo: number;
  demandesNonResoluesHebdo: number;
  ticketsHorsSlaCloture: number;
  ticketsHorsSlaPriseEnCharge: number;
}

interface ExcelBaseline {
  demandesItHebdo: number | null;
  demandesNonResoluesHebdo: number | null;
  ticketsHorsSlaCloture: number | null;
  ticketsHorsSlaPriseEnCharge: number | null;
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
  categoryField: "component" as "component" | "label" | "issuetype" | "custom",
  categoryCustomFieldId: "",
};

function parseInitialWeek(initialWeek: string): { year: number; week: number } {
  const m = initialWeek.match(/^(\d{4})-S(\d{2})$/);
  if (m) return { year: Number(m[1]), week: Number(m[2]) };
  const now = new Date();
  return { year: now.getFullYear(), week: 1 };
}

export function JiraSyncPanel({ initialWeek }: { initialWeek: string }) {
  const initial = parseInitialWeek(initialWeek);
  const [year, setYear] = useState(initial.year);
  const [week, setWeek] = useState(initial.week);
  const [weekId, setWeekId] = useState(initialWeek);
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [connected, setConnected] = useState(false);
  const [source, setSource] = useState<"account" | "env" | null>(null);
  const [connection, setConnection] = useState<ConnectionView | null>(null);
  const [jql, setJql] = useState<JqlPreview | null>(null);
  const [dateRange, setDateRange] = useState<{
    start: string;
    endExclusive: string;
  } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [values, setValues] = useState<WeekValues | null>(null);
  const [excelBaseline, setExcelBaseline] = useState<ExcelBaseline | null>(
    null,
  );
  const [lastMode, setLastMode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
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
  const [saveFields, setSaveFields] = useState({
    demandesItHebdo: true,
    demandesNonResoluesHebdo: false,
    ticketsHorsSlaCloture: true,
    ticketsHorsSlaPriseEnCharge: true,
    ticketsByType: true,
    ticketsByAssignee: true,
    ticketsByRequester: true,
  });
  const [breakdowns, setBreakdowns] = useState<{
    byType: Record<string, number>;
    byAssignee: Record<string, number>;
    byRequester: Record<string, number>;
  } | null>(null);
  const [reqFrom, setReqFrom] = useState(2);
  const [reqTo, setReqTo] = useState(31);
  const [importParts, setImportParts] = useState({
    assignee: true,
    requester: true,
    type: false,
  });
  const [reqProgress, setReqProgress] = useState<{
    current: number;
    total: number;
    weekId: string;
    ok: number;
    failed: number;
    lastError?: string;
  } | null>(null);
  const [reqBusy, setReqBusy] = useState(false);
  const [storage, setStorage] = useState<{
    backend: "supabase" | "blob" | "disk";
    ok: boolean;
    updatedAt: string | null;
    weeks: number | null;
    assigneeWeeks: number | null;
    requesterWeeks: number | null;
    error?: string;
  } | null>(null);

  const composedWeekId = `${year}-S${String(week).padStart(2, "0")}`;

  const loadMeta = useCallback(async () => {
    const [connectRes, syncRes, kpisRes, storageRes] = await Promise.all([
      fetch("/api/jira/connect"),
      fetch(
        `/api/jira/sync?year=${encodeURIComponent(String(year))}&weekNum=${encodeURIComponent(String(week))}`,
      ),
      fetch(`/api/kpis?week=${encodeURIComponent(composedWeekId)}`),
      fetch("/api/storage"),
    ]);
    const connect = await connectRes.json();
    const sync = await syncRes.json();
    const kpis = await kpisRes.json();
    const storageJson = await storageRes.json().catch(() => null);

    setConnected(Boolean(connect.connected));
    setSource(connect.source);
    setConnection(connect.connection);
    setJql(sync.previewJql);
    setDateRange(sync.dateRange ?? null);
    setWeeks(kpis.weeks);
    setWeekId(composedWeekId);
    if (storageJson?.backend) setStorage(storageJson);

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
        categoryCustomFieldId:
          connect.connection.categoryCustomFieldId ?? "",
        apiToken: "",
      }));
    }
  }, [year, week, composedWeekId]);

  useEffect(() => {
    startTransition(() => {
      void loadMeta();
    });
  }, [loadMeta]);

  function applyWeekId(id: string) {
    const m = id.match(/^(\d{4})-S(\d{2})$/);
    if (!m) return;
    setYear(Number(m[1]));
    setWeek(Number(m[2]));
    setWeekId(id);
  }

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

  function runQuery(opts: { dryRun: boolean; useMock: boolean }) {
    setResult(null);
    setError(null);
    setWarnings([]);
    setDiagnostics(null);
    setProbe(null);
    setValues(null);
    setExcelBaseline(null);
    setBreakdowns(null);
    setSaved(false);
    setLastMode(null);

    startTransition(async () => {
      const res = await fetch("/api/jira/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          week,
          dryRun: opts.dryRun,
          useMock: opts.useMock,
          saveFields,
          forceOpenLive: saveFields.demandesNonResoluesHebdo,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Requête échouée");
        return;
      }

      setJql(json.jql);
      if (json.jql) {
        setDateRange({
          start: json.jql.start,
          endExclusive: json.jql.endExclusive,
        });
      }
      setWarnings(json.warnings ?? []);
      setProbe(json.probe ?? null);
      setDiagnostics(json.diagnostics ?? null);
      setValues(json.values ?? null);
      setBreakdowns(json.breakdowns ?? null);
      setExcelBaseline(json.excelBaseline ?? null);
      setLastMode(json.mode);
      setSaved(!json.dryRun);
      setWeekId(json.weekId ?? composedWeekId);

      const label = json.dryRun ? "Test" : "Sync";
      const saved =
        !json.dryRun && json.savedFields?.length
          ? ` · enregistré : ${json.savedFields.join(", ")}`
          : json.dryRun
            ? " (non enregistré)"
            : "";
      const bdHint = json.breakdowns
        ? ` · ${Object.keys(json.breakdowns.byAssignee ?? {}).length} resp., ${Object.keys(json.breakdowns.byRequester ?? {}).length} dem.`
        : "";
      setResult(
        `${label} ${json.mode} OK — ${json.year}-S${String(json.week).padStart(2, "0")}${saved}${bdHint}`,
      );

      if (!json.dryRun) {
        await loadMeta();
      }
    });
  }

  function applySelectionToDb() {
    if (!values) {
      setError("Lancez d’abord un test pour obtenir des valeurs.");
      return;
    }
    setResult(null);
    setError(null);
    setWarnings([]);
    startTransition(async () => {
      const res = await fetch("/api/jira/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          week,
          dryRun: false,
          saveFields,
          forceOpenLive: saveFields.demandesNonResoluesHebdo,
          applyValues: values,
          applyBreakdowns: breakdowns ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Enregistrement échoué");
        return;
      }
      setValues(json.values ?? values);
      setBreakdowns(json.breakdowns ?? breakdowns);
      setExcelBaseline(json.excelBaseline ?? excelBaseline);
      setWarnings(json.warnings ?? []);
      setSaved(true);
      setLastMode("apply");
      setResult(
        `Base mise à jour — ${json.weekId} : ${(json.savedFields ?? []).join(", ") || "aucun champ"}`,
      );
      await loadMeta();
    });
  }

  function clearSelectionForWeek() {
    if (
      !window.confirm(
        `Effacer les cases cochées pour ${composedWeekId} ?\nLes autres données de la semaine resteront intactes.`,
      )
    ) {
      return;
    }
    setResult(null);
    setError(null);
    setWarnings([]);
    startTransition(async () => {
      const res = await fetch("/api/jira/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clear",
          year,
          week,
          saveFields,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Effacement échoué");
        return;
      }
      setWarnings(json.warnings ?? []);
      setSaved(false);
      setLastMode("clear");
      setResult(
        `Effacé — ${json.weekId} : ${(json.cleared ?? []).join(", ") || "rien"}`,
      );
      await loadMeta();
    });
  }

  function setAllSaveFields(value: boolean) {
    setSaveFields({
      demandesItHebdo: value,
      demandesNonResoluesHebdo: value,
      ticketsHorsSlaCloture: value,
      ticketsHorsSlaPriseEnCharge: value,
      ticketsByType: value,
      ticketsByAssignee: value,
      ticketsByRequester: value,
    });
  }

  async function syncBreakdownRange(opts: { useMock: boolean }) {
    const from = Math.min(reqFrom, reqTo);
    const to = Math.max(reqFrom, reqTo);
    if (from < 1 || to > 53) {
      setError("Plage de semaines invalide (1–53).");
      return;
    }
    const parts = (
      [
        importParts.type ? "type" : null,
        importParts.assignee ? "assignee" : null,
        importParts.requester ? "requester" : null,
      ] as const
    ).filter((p): p is "type" | "assignee" | "requester" => p != null);

    if (parts.length === 0) {
      setError(
        "Cochez au moins une ventilation (assigné, demandeur ou type).",
      );
      return;
    }

    setError(null);
    setResult(null);
    setReqBusy(true);
    const total = to - from + 1;
    let ok = 0;
    let failed = 0;
    let lastError: string | undefined;
    let sampleAssignees: string[] = [];

    for (let w = from; w <= to; w++) {
      const weekIdLabel = `${year}-S${String(w).padStart(2, "0")}`;
      setReqProgress({
        current: w - from + 1,
        total,
        weekId: weekIdLabel,
        ok,
        failed,
        lastError,
      });
      try {
        const res = await fetch("/api/jira/sync-requesters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year,
            week: w,
            parts,
            useMock: opts.useMock,
            dryRun: false,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          failed += 1;
          lastError = `${weekIdLabel}: ${json.error ?? "échec"}`;
        } else {
          ok += 1;
          const row = json.results?.[0];
          if (row?.sampleAssignees?.length && !sampleAssignees.length) {
            sampleAssignees = row.sampleAssignees;
          }
        }
      } catch (err) {
        failed += 1;
        lastError =
          err instanceof Error
            ? `${weekIdLabel}: ${err.message}`
            : `${weekIdLabel}: erreur réseau`;
      }
      setReqProgress({
        current: w - from + 1,
        total,
        weekId: weekIdLabel,
        ok,
        failed,
        lastError,
      });
    }

    setReqBusy(false);
    const partsLabel = parts
      .map((p) =>
        p === "assignee"
          ? "assignés"
          : p === "requester"
            ? "demandeurs"
            : "types",
      )
      .join(", ");
    setResult(
      `Import ${partsLabel} S${String(from).padStart(2, "0")}–S${String(to).padStart(2, "0")} : ${ok} OK` +
        (failed ? `, ${failed} échec(s)` : "") +
        (sampleAssignees.length
          ? ` — ex. assignés : ${sampleAssignees.join(", ")}`
          : "") +
        " — KPI hebdo inchangés.",
    );
    if (failed && lastError) setError(lastError);
  }

  async function clearBreakdowns(scope: "range" | "year") {
    const from = Math.min(reqFrom, reqTo);
    const to = Math.max(reqFrom, reqTo);
    const parts = (
      [
        importParts.type ? "type" : null,
        importParts.assignee ? "assignee" : null,
        importParts.requester ? "requester" : null,
      ] as const
    ).filter((p): p is "type" | "assignee" | "requester" => p != null);

    if (parts.length === 0) {
      setError("Cochez au moins une ventilation à effacer.");
      return;
    }

    const partsLabel = parts
      .map((p) =>
        p === "assignee"
          ? "assignés"
          : p === "requester"
            ? "demandeurs"
            : "types",
      )
      .join(", ");
    const label =
      scope === "year"
        ? `toute l’année ${year}`
        : `S${String(from).padStart(2, "0")}–S${String(to).padStart(2, "0")} (${year})`;
    if (
      !window.confirm(
        `Effacer ${partsLabel} pour ${label} ?\nLes KPI hebdo ne seront pas touchés.`,
      )
    ) {
      return;
    }
    setError(null);
    setResult(null);
    setReqBusy(true);
    try {
      const res = await fetch("/api/jira/sync-requesters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          scope === "year"
            ? { action: "clear", year, parts }
            : { action: "clear", year, weekFrom: from, weekTo: to, parts },
        ),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Effacement échoué");
        return;
      }
      setReqProgress(null);
      setResult(
        `${partsLabel} effacés (${label}) : ${json.removed ?? 0} entrée(s) retirée(s).`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de l’effacement",
      );
    } finally {
      setReqBusy(false);
    }
  }

  const weekValid = year >= 2000 && year <= 2100 && week >= 1 && week <= 53;
  const anySaveField = Object.values(saveFields).some(Boolean);
  const rangeValid =
    year >= 2000 &&
    year <= 2100 &&
    reqFrom >= 1 &&
    reqFrom <= 53 &&
    reqTo >= 1 &&
    reqTo <= 53;
  const anyImportPart =
    importParts.assignee || importParts.requester || importParts.type;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
            Connexion & sync Jira
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Testez n’importe quelle année / semaine ISO : créés, non résolus,
            hors SLA clôture (48h) et hors SLA prise en charge (24h).
          </p>
        </div>
        {weeks.length > 0 && (
          <WeekSelector
            weeks={weeks}
            value={
              weeks.some((w) => w.id === weekId) ? weekId : weeks[0]?.id ?? weekId
            }
            onChange={applyWeekId}
          />
        )}
      </div>

      {storage && (
        <p
          className={`rounded-lg border px-4 py-3 text-sm ${
            storage.backend === "supabase" && storage.ok
              ? "border-[var(--ok)]/40 bg-[var(--ok)]/10 text-[var(--ink)]"
              : "border-[var(--warn)]/40 bg-[var(--warn)]/10 text-[var(--ink)]"
          }`}
        >
          {storage.backend === "supabase" && storage.ok ? (
            <>
              Persistance : <strong>Supabase</strong>
              {storage.updatedAt
                ? ` · maj ${new Date(storage.updatedAt).toLocaleString("fr-BE")}`
                : ""}
              {storage.requesterWeeks != null
                ? ` · ${storage.requesterWeeks} sem. demandeurs`
                : ""}
              {storage.assigneeWeeks != null
                ? ` · ${storage.assigneeWeeks} sem. assignés`
                : ""}
            </>
          ) : storage.backend === "supabase" ? (
            <>
              Supabase configuré mais injoignable
              {storage.error ? ` : ${storage.error}` : "."}
            </>
          ) : (
            <>
              Persistance : <strong>{storage.backend}</strong> (pas encore
              Supabase — vérifiez SUPABASE_URL / SERVICE_ROLE_KEY sur Vercel).
            </>
          )}
        </p>
      )}

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
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-[var(--muted)]">
              Source catégorie / type de demande
            </span>
            <select
              className="rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)]"
              value={form.categoryField}
              onChange={(e) =>
                setForm({
                  ...form,
                  categoryField: e.target.value as typeof form.categoryField,
                })
              }
            >
              <option value="component">Composant Jira (components)</option>
              <option value="label">Premier label</option>
              <option value="issuetype">Type de ticket (issuetype)</option>
              <option value="custom">Champ custom (customfield_…)</option>
            </select>
          </label>
          {form.categoryField === "custom" && (
            <Field
              label="ID champ catégorie (customfield_…)"
              value={form.categoryCustomFieldId}
              onChange={(v) => setForm({ ...form, categoryCustomFieldId: v })}
              placeholder="customfield_10001"
              wide
            />
          )}
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
              onClick={() => void disconnect()}
              className="rounded-md border border-[var(--crit)]/40 px-4 py-2 text-sm text-[var(--crit)]"
            >
              Déconnecter
            </button>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-xl">
          Tester une semaine
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Cochez ce que vous voulez synchroniser ou effacer : KPI et
          ventilations (assignés Jira, demandeurs, types). Seules les cases
          cochées sont touchées.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Année</span>
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
              className="w-28 rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2 outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Semaine ISO</span>
            <input
              type="number"
              min={1}
              max={53}
              value={week}
              onChange={(e) => setWeek(Number(e.target.value) || week)}
              className="w-28 rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2 outline-none focus:border-[var(--accent)]"
            />
          </label>
          <p className="pb-2 text-sm text-[var(--muted)]">
            → <span className="font-medium text-[var(--ink)]">{composedWeekId}</span>
            {dateRange ? (
              <>
                {" "}
                ({dateRange.start} → {dateRange.endExclusive})
              </>
            ) : null}
          </p>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--wash)] p-3">
          <legend className="px-1 text-xs uppercase tracking-wider text-[var(--muted)]">
            Sélection
          </legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAllSaveFields(true)}
              className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink-soft)] hover:bg-[var(--paper)]"
            >
              Tout cocher
            </button>
            <button
              type="button"
              onClick={() => setAllSaveFields(false)}
              className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink-soft)] hover:bg-[var(--paper)]"
            >
              Tout décocher
            </button>
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
            KPI hebdo
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <SaveCheck
              label="Tickets créés"
              checked={saveFields.demandesItHebdo}
              onChange={(v) =>
                setSaveFields((f) => ({ ...f, demandesItHebdo: v }))
              }
            />
            <SaveCheck
              label="Hors SLA clôture"
              checked={saveFields.ticketsHorsSlaCloture}
              onChange={(v) =>
                setSaveFields((f) => ({ ...f, ticketsHorsSlaCloture: v }))
              }
            />
            <SaveCheck
              label="Hors SLA prise en charge"
              checked={saveFields.ticketsHorsSlaPriseEnCharge}
              onChange={(v) =>
                setSaveFields((f) => ({ ...f, ticketsHorsSlaPriseEnCharge: v }))
              }
            />
            <SaveCheck
              label="Non résolus (écrase le figé)"
              checked={saveFields.demandesNonResoluesHebdo}
              onChange={(v) =>
                setSaveFields((f) => ({ ...f, demandesNonResoluesHebdo: v }))
              }
            />
          </div>
          <p className="pt-1 text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
            Ventilations tickets
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <SaveCheck
              label="Assignés Jira (assignee)"
              checked={saveFields.ticketsByAssignee}
              onChange={(v) =>
                setSaveFields((f) => ({ ...f, ticketsByAssignee: v }))
              }
            />
            <SaveCheck
              label="Demandeurs (reporter)"
              checked={saveFields.ticketsByRequester}
              onChange={(v) =>
                setSaveFields((f) => ({ ...f, ticketsByRequester: v }))
              }
            />
            <SaveCheck
              label="Types de demande"
              checked={saveFields.ticketsByType}
              onChange={(v) =>
                setSaveFields((f) => ({ ...f, ticketsByType: v }))
              }
            />
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !connected || !weekValid}
            onClick={() => runQuery({ dryRun: true, useMock: false })}
            className="rounded-md border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-50"
          >
            {pending ? "Calcul…" : "Tester (sans enregistrer)"}
          </button>
          <button
            type="button"
            disabled={pending || !connected || !weekValid || !anySaveField}
            onClick={() => runQuery({ dryRun: false, useMock: false })}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Synchroniser la sélection
          </button>
          <button
            type="button"
            disabled={
              pending || !connected || !weekValid || !values || !anySaveField
            }
            onClick={() => applySelectionToDb()}
            className="rounded-md border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-50"
          >
            Appliquer le dernier test
          </button>
          <button
            type="button"
            disabled={pending || !weekValid || !anySaveField}
            onClick={() => clearSelectionForWeek()}
            className="rounded-md border border-[var(--crit)]/40 px-4 py-2 text-sm text-[var(--crit)] disabled:opacity-50"
          >
            Effacer la sélection
          </button>
          <button
            type="button"
            disabled={pending || !weekValid}
            onClick={() => runQuery({ dryRun: true, useMock: true })}
            className="rounded-md border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-50"
          >
            Test démo
          </button>
        </div>

        {result && <p className="text-sm text-[var(--ok)]">{result}</p>}
        {error && <p className="text-sm text-[var(--crit)]">{error}</p>}

        {values && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label="Tickets créés"
              value={values.demandesItHebdo}
              hint="Demandes IT — Hebdo"
              baseline={excelBaseline?.demandesItHebdo}
            />
            <KpiTile
              label="Non résolus"
              value={values.demandesNonResoluesHebdo}
              hint="Live si semaine en cours · figé dimanche 23:59 sinon"
              baseline={excelBaseline?.demandesNonResoluesHebdo}
            />
            <KpiTile
              label="Hors SLA clôture"
              value={values.ticketsHorsSlaCloture}
              hint="> 48h ouvrées (Bruxelles)"
              baseline={excelBaseline?.ticketsHorsSlaCloture}
            />
            <KpiTile
              label="Hors SLA prise en charge"
              value={values.ticketsHorsSlaPriseEnCharge}
              hint="> 24h ouvrées (Bruxelles)"
              baseline={excelBaseline?.ticketsHorsSlaPriseEnCharge}
            />
          </div>
        )}

        {breakdowns && (
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--paper)]/60 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                Assignés Jira
              </p>
              <p className="mt-1 text-[var(--ink-soft)]">
                {Object.keys(breakdowns.byAssignee).length
                  ? Object.entries(breakdowns.byAssignee)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 4)
                      .map(([n, c]) => `${n} (${c})`)
                      .join(" · ")
                  : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--paper)]/60 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                Demandeurs
              </p>
              <p className="mt-1 text-[var(--ink-soft)]">
                {Object.keys(breakdowns.byRequester).length
                  ? Object.entries(breakdowns.byRequester)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 4)
                      .map(([n, c]) => `${n} (${c})`)
                      .join(" · ")
                  : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--paper)]/60 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                Types
              </p>
              <p className="mt-1 text-[var(--ink-soft)]">
                {Object.keys(breakdowns.byType).length
                  ? Object.entries(breakdowns.byType)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 4)
                      .map(([n, c]) => `${n} (${c})`)
                      .join(" · ")
                  : "—"}
              </p>
            </div>
          </div>
        )}

        {values && excelBaseline && (
          <p className="text-xs text-[var(--muted)]">
            Comparaison Excel sous chaque KPI. Les « non résolus » des semaines
            passées sont figés le dimanche 23:59 (cron Bruxelles) et ne sont
            plus écrasés par un test live.
          </p>
        )}

        {values && (
          <p className="text-xs text-[var(--muted)]">
            Source : {lastMode}
            {saved ? " · enregistré" : " · non enregistré"}
            {jql?.usedRelativeWeekFunctions
              ? " · JQL relatif startOfWeek(-1) (comme n8n)"
              : jql
                ? ` · JQL dates ${jql.start} → ${jql.endExclusive}`
                : ""}
          </p>
        )}

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
            Détail : créés={diagnostics.createdCount}, ouverts=
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

      <section className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-xl">
          Importer ventilations (plage)
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Remplit les statistiques <strong>par assigné Jira</strong>,{" "}
          <strong>par demandeur</strong> et/ou <strong>par type</strong> à
          partir des tickets créés. Les assignés viennent du champ{" "}
          <code className="text-xs">assignee</code> (pas de la liste
          Configuration). Les KPI hebdo ne sont pas modifiés.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Année</span>
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
              className="w-28 rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2 outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">De la semaine</span>
            <input
              type="number"
              min={1}
              max={53}
              value={reqFrom}
              onChange={(e) => setReqFrom(Number(e.target.value) || reqFrom)}
              className="w-28 rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2 outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">À la semaine</span>
            <input
              type="number"
              min={1}
              max={53}
              value={reqTo}
              onChange={(e) => setReqTo(Number(e.target.value) || reqTo)}
              className="w-28 rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2 outline-none focus:border-[var(--accent)]"
            />
          </label>
          <p className="pb-2 text-sm text-[var(--muted)]">
            → {year}-S{String(Math.min(reqFrom, reqTo)).padStart(2, "0")} …{" "}
            {year}-S{String(Math.max(reqFrom, reqTo)).padStart(2, "0")} (
            {Math.abs(reqTo - reqFrom) + 1} semaines)
          </p>
        </div>

        <fieldset className="space-y-2 rounded-lg border border-[var(--line)] bg-[var(--wash)] p-3">
          <legend className="px-1 text-xs uppercase tracking-wider text-[var(--muted)]">
            Ventilations à importer / effacer
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            <SaveCheck
              label="Assignés Jira (assignee)"
              checked={importParts.assignee}
              onChange={(v) =>
                setImportParts((p) => ({ ...p, assignee: v }))
              }
            />
            <SaveCheck
              label="Demandeurs (reporter)"
              checked={importParts.requester}
              onChange={(v) =>
                setImportParts((p) => ({ ...p, requester: v }))
              }
            />
            <SaveCheck
              label="Types de demande"
              checked={importParts.type}
              onChange={(v) => setImportParts((p) => ({ ...p, type: v }))}
            />
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={
              pending || reqBusy || !connected || !rangeValid || !anyImportPart
            }
            onClick={() => void syncBreakdownRange({ useMock: false })}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {reqBusy
              ? `Import… ${reqProgress?.current ?? 0}/${reqProgress?.total ?? 0}`
              : "Importer depuis Jira"}
          </button>
          <button
            type="button"
            disabled={pending || reqBusy || !rangeValid || !anyImportPart}
            onClick={() => void syncBreakdownRange({ useMock: true })}
            className="rounded-md border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-50"
          >
            Import démo (fictif)
          </button>
          <button
            type="button"
            disabled={pending || reqBusy || !rangeValid || !anyImportPart}
            onClick={() => void clearBreakdowns("range")}
            className="rounded-md border border-[var(--crit)]/40 px-4 py-2 text-sm text-[var(--crit)] disabled:opacity-50"
          >
            Effacer la plage
          </button>
          <button
            type="button"
            disabled={pending || reqBusy || year < 2000 || !anyImportPart}
            onClick={() => void clearBreakdowns("year")}
            className="rounded-md border border-[var(--crit)]/40 px-4 py-2 text-sm text-[var(--crit)] disabled:opacity-50"
          >
            Effacer toute l’année
          </button>
        </div>

        {reqProgress && (
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded bg-[var(--wash)]">
              <div
                className="h-full rounded bg-[var(--accent)] transition-all duration-300"
                style={{
                  width: `${(reqProgress.current / Math.max(reqProgress.total, 1)) * 100}%`,
                }}
              />
            </div>
            <p className="text-xs text-[var(--muted)]">
              {reqProgress.weekId} — {reqProgress.ok} OK
              {reqProgress.failed ? `, ${reqProgress.failed} échec(s)` : ""}
              {reqBusy ? "…" : " — terminé"}
            </p>
          </div>
        )}

        {result &&
          (result.toLowerCase().includes("assign") ||
            result.toLowerCase().includes("demandeur") ||
            result.toLowerCase().includes("type") ||
            result.toLowerCase().includes("import") ||
            result.toLowerCase().includes("effac")) && (
            <p className="text-sm text-[var(--ok)]">{result}</p>
          )}
        {error && <p className="text-sm text-[var(--crit)]">{error}</p>}
      </section>

      {jql && (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg">
            JQL{" "}
            {jql.usedRelativeWeekFunctions
              ? "(startOfWeek relatif)"
              : `(${jql.start} 00:00 → ${jql.endExclusive} 00:00)`}
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

function SaveCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ink)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--accent)]"
      />
      {label}
    </label>
  );
}

function KpiTile({
  label,
  value,
  hint,
  baseline,
}: {
  label: string;
  value: number;
  hint: string;
  baseline?: number | null;
}) {
  const hasBaseline = baseline != null;
  const match = hasBaseline && baseline === value;
  const diff =
    hasBaseline && baseline !== value ? value - (baseline as number) : null;

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--wash)] px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
      {hasBaseline && (
        <p
          className={`mt-2 text-xs ${match ? "text-[var(--ok)]" : "text-[var(--warn)]"}`}
        >
          Excel : {baseline}
          {match
            ? " · OK"
            : diff != null
              ? ` · écart ${diff > 0 ? "+" : ""}${diff}`
              : ""}
        </p>
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
