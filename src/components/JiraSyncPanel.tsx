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

interface WeekValues {
  demandesItHebdo: number;
  demandesNonResoluesHebdo: number;
  ticketsHorsSlaCloture: number;
  ticketsHorsSlaPriseEnCharge: number;
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
  const [smtp, setSmtp] = useState<{
    configured: boolean;
    host: string | null;
    from: string | null;
    to: string[];
  } | null>(null);
  const [mailTo, setMailTo] = useState("");
  const [mailMsg, setMailMsg] = useState<string | null>(null);

  const composedWeekId = `${year}-S${String(week).padStart(2, "0")}`;

  const loadMeta = useCallback(async () => {
    const [connectRes, syncRes, kpisRes, mailRes] = await Promise.all([
      fetch("/api/jira/connect"),
      fetch(
        `/api/jira/sync?year=${encodeURIComponent(String(year))}&weekNum=${encodeURIComponent(String(week))}`,
      ),
      fetch(`/api/kpis?week=${encodeURIComponent(composedWeekId)}`),
      fetch("/api/mail/send"),
    ]);
    const connect = await connectRes.json();
    const sync = await syncRes.json();
    const kpis = await kpisRes.json();
    const mail = await mailRes.json();

    setConnected(Boolean(connect.connected));
    setSource(connect.source);
    setConnection(connect.connection);
    setJql(sync.previewJql);
    setDateRange(sync.dateRange ?? null);
    setWeeks(kpis.weeks);
    setWeekId(composedWeekId);
    setSmtp({
      configured: Boolean(mail.configured),
      host: mail.host ?? null,
      from: mail.from ?? null,
      to: mail.to ?? [],
    });
    setMailTo((prev) =>
      prev.trim() ? prev : (mail.to ?? []).join(", "),
    );

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
      setLastMode(json.mode);
      setSaved(!json.dryRun);
      setWeekId(json.weekId ?? composedWeekId);

      const label = json.dryRun ? "Test" : "Sync";
      setResult(
        `${label} ${json.mode} OK — ${json.year}-S${String(json.week).padStart(2, "0")}` +
          (json.dryRun ? " (non enregistré)" : " (enregistré au dashboard)"),
      );

      if (!json.dryRun) {
        await loadMeta();
      }
    });
  }

  const weekValid = year >= 2000 && year <= 2100 && week >= 1 && week <= 53;

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
          Choisissez l’année et le numéro de semaine ISO, puis lancez un test
          (lecture seule) ou enregistrez les valeurs dans le dashboard.
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

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !connected || !weekValid}
            onClick={() => runQuery({ dryRun: true, useMock: false })}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Calcul…" : "Tester cette semaine"}
          </button>
          <button
            type="button"
            disabled={pending || !connected || !weekValid}
            onClick={() => runQuery({ dryRun: false, useMock: false })}
            className="rounded-md border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-50"
          >
            Tester + enregistrer
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
            />
            <KpiTile
              label="Non résolus"
              value={values.demandesNonResoluesHebdo}
              hint="Snapshot ouvert actuel"
            />
            <KpiTile
              label="Hors SLA clôture"
              value={values.ticketsHorsSlaCloture}
              hint="> 48h ouvrées"
            />
            <KpiTile
              label="Hors SLA prise en charge"
              value={values.ticketsHorsSlaPriseEnCharge}
              hint="> 24h ouvrées"
            />
          </div>
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
          Envoyer par email (Office 365)
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Expéditeur <code className="text-xs">noreply@coverseal.com</code> via{" "}
          <code className="text-xs">smtp.office365.com</code>. Sur Vercel :
          <code className="text-xs"> SMTP_USER</code>,{" "}
          <code className="text-xs">SMTP_PASS</code>,{" "}
          <code className="text-xs">SMTP_TO</code>. Activez « Authenticated
          SMTP » sur la boîte noreply.
        </p>
        {smtp ? (
          <p className="text-xs text-[var(--muted)]">
            {smtp.configured ? (
              <>
                Office 365 : {smtp.host}
                {smtp.from ? ` · de ${smtp.from}` : ""}
              </>
            ) : (
              <span className="text-[var(--warn)]">
                Non configuré — ajoutez SMTP_PASS + SMTP_TO sur Vercel (user =
                noreply@coverseal.com).
              </span>
            )}
          </p>
        ) : null}
        <label className="flex max-w-xl flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Destinataires</span>
          <input
            type="text"
            value={mailTo}
            onChange={(e) => setMailTo(e.target.value)}
            placeholder="q.devits@coverseal.com"
            className="rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2 outline-none focus:border-[var(--accent)]"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !smtp?.configured || !weekValid}
            onClick={() => {
              setMailMsg(null);
              setError(null);
              startTransition(async () => {
                const res = await fetch("/api/mail/send", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    year,
                    week,
                    syncFirst: true,
                    save: true,
                    to: mailTo || undefined,
                  }),
                });
                const json = await res.json();
                if (!res.ok || !json.ok) {
                  setError(json.error ?? "Envoi email échoué");
                  return;
                }
                setValues(json.values);
                setMailMsg(
                  `Email envoyé à ${json.to.join(", ")} — ${json.weekId}`,
                );
              });
            }}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Envoyer le rapport
          </button>
          <button
            type="button"
            disabled={pending || !smtp?.configured}
            onClick={() => {
              setMailMsg(null);
              setError(null);
              startTransition(async () => {
                const res = await fetch("/api/mail/send", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ verifyOnly: true }),
                });
                const json = await res.json();
                if (!res.ok || !json.ok) {
                  setError(json.error ?? "SMTP invalide");
                  return;
                }
                setMailMsg("Connexion SMTP OK");
              });
            }}
            className="rounded-md border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-50"
          >
            Vérifier SMTP
          </button>
        </div>
        {mailMsg && <p className="text-sm text-[var(--ok)]">{mailMsg}</p>}
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

function KpiTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--wash)] px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
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
