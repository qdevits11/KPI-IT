/**
 * Génération déterministe du retour de semaine (fluctuation + recommandations)
 * à partir des KPI hebdo et des ventilations tickets.
 */

import type { AppDatabase, WeeklyRow } from "./types";
import { parseWeekId, weekId } from "./types";

export type WeekAnalysisSeverity = "info" | "warn" | "critical";

export type WeekAnalysisSignal = {
  kind:
    | "kpi_delta"
    | "sla"
    | "stock"
    | "type_spike"
    | "load"
    | "throughput"
    | "data";
  severity: WeekAnalysisSeverity;
  /** Phrase pour la section fluctuation. */
  observation: string;
  /** Action suggérée (optionnel). */
  recommendation?: string;
};

export type WeekAnalysisResult = {
  weekId: string;
  fluctuation: string;
  recommandations: string;
  signals: WeekAnalysisSignal[];
};

const BASELINE_WEEKS = 8;
/** Variation relative min pour signaler un KPI (vs S-1 ou baseline). */
const KPI_DELTA_PCT = 0.2;
/** Variation absolue min (évite le bruit sur petits volumes). */
const KPI_DELTA_ABS = 3;
/** Pic type : +100 % vs moyenne et au moins 3 tickets. */
const TYPE_SPIKE_PCT = 1;
const TYPE_SPIKE_MIN = 3;
/** Surcharge : stock (ou créés) > 1,5× médiane, min 5. */
const LOAD_RATIO = 1.5;
const LOAD_MIN = 5;

function pctDelta(current: number, baseline: number): number | null {
  if (baseline <= 0) {
    if (current <= 0) return 0;
    return null;
  }
  return (current - baseline) / baseline;
}

function formatPct(delta: number): string {
  const pct = Math.round(delta * 100);
  return pct > 0 ? `+${pct} %` : `${pct} %`;
}

function formatDelta(current: number, previous: number | null): string {
  if (previous == null) return String(current);
  const d = current - previous;
  if (d === 0) return `${current} (stable)`;
  return `${previous} → ${current} (${d > 0 ? "+" : ""}${d})`;
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function significantDelta(
  current: number,
  reference: number | null,
): boolean {
  if (reference == null) return false;
  const abs = Math.abs(current - reference);
  if (abs < KPI_DELTA_ABS) return false;
  const rel = pctDelta(current, reference);
  if (rel == null) return current >= KPI_DELTA_ABS;
  return Math.abs(rel) >= KPI_DELTA_PCT;
}

function weeksBefore(
  db: AppDatabase,
  year: number,
  week: number,
  limit: number,
): WeeklyRow[] {
  return db.weeks
    .filter((w) => w.year === year && w.week < week)
    .sort((a, b) => b.week - a.week)
    .slice(0, limit);
}

function topEntries(
  bag: Record<string, number> | undefined,
  limit: number,
): { name: string; count: number }[] {
  if (!bag) return [];
  return Object.entries(bag)
    .filter(([, n]) => n > 0)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function baselineForLabel(
  series: Record<string, Record<string, number>>,
  label: string,
  weekKeys: string[],
): number {
  const values = weekKeys.map((k) => series[k]?.[label] ?? 0);
  return avg(values) ?? 0;
}

function pushKpiSignal(
  signals: WeekAnalysisSignal[],
  label: string,
  current: number | null,
  previous: number | null,
  baseline: number | null,
  opts?: {
    higherIsWorse?: boolean;
    recommendUp?: string;
    recommendDown?: string;
  },
): void {
  if (current == null) return;
  const higherIsWorse = opts?.higherIsWorse ?? false;
  const ref = previous ?? baseline;
  if (!significantDelta(current, ref)) return;

  const vsPrev =
    previous != null ? formatDelta(current, previous) : String(current);

  const up = previous != null ? current > previous : baseline != null && current > baseline;
  const severity: WeekAnalysisSeverity =
    higherIsWorse && up
      ? "warn"
      : !higherIsWorse && !up
        ? "warn"
        : "info";

  const trend = up ? "en hausse" : "en baisse";
  const observation = `${label.toLowerCase()} ${trend} (${vsPrev})`;
  const recommendation = up ? opts?.recommendUp : opts?.recommendDown;

  signals.push({
    kind: "kpi_delta",
    severity,
    observation,
    recommendation,
  });
}

/**
 * Analyse une semaine et propose fluctuation + recommandations.
 * Ne persiste rien — le responsable KPI valide ensuite.
 */
export function generateWeekAnalysis(
  db: AppDatabase,
  id: string,
): WeekAnalysisResult {
  const { year, week } = parseWeekId(id);
  const current = db.weeks.find((w) => weekId(w) === id);
  const signals: WeekAnalysisSignal[] = [];

  if (!current) {
    return {
      weekId: id,
      fluctuation:
        "Aucune donnée pour cette semaine — synchroniser Jira avant de générer l’analyse.",
      recommandations: "Synchroniser la semaine puis régénérer l’analyse.",
      signals: [
        {
          kind: "data",
          severity: "critical",
          observation: "semaine absente de la base",
          recommendation: "synchroniser Jira pour cette semaine",
        },
      ],
    };
  }

  const prior = weeksBefore(db, year, week, BASELINE_WEEKS);
  const previous = prior[0] ?? null;
  const priorKeys = prior.map((w) => weekId(w));

  const curDemandes = num(current.demandesItHebdo);
  const prevDemandes = num(previous?.demandesItHebdo);
  const baseDemandes = avg(
    prior.map((w) => w.demandesItHebdo).filter((v): v is number => v != null),
  );

  const curClosed = num(current.demandesClotureesHebdo);
  const prevClosed = num(previous?.demandesClotureesHebdo);
  const baseClosed = avg(
    prior
      .map((w) => w.demandesClotureesHebdo)
      .filter((v): v is number => v != null),
  );

  const curOpen = num(current.demandesNonResoluesHebdo);
  const prevOpen = num(previous?.demandesNonResoluesHebdo);
  const baseOpen = avg(
    prior
      .map((w) => w.demandesNonResoluesHebdo)
      .filter((v): v is number => v != null),
  );

  const curSlaClose = num(current.ticketsHorsSlaCloture);
  const prevSlaClose = num(previous?.ticketsHorsSlaCloture);
  const baseSlaClose = avg(
    prior
      .map((w) => w.ticketsHorsSlaCloture)
      .filter((v): v is number => v != null),
  );

  const curSlaPickup = num(current.ticketsHorsSlaPriseEnCharge);
  const prevSlaPickup = num(previous?.ticketsHorsSlaPriseEnCharge);
  const baseSlaPickup = avg(
    prior
      .map((w) => w.ticketsHorsSlaPriseEnCharge)
      .filter((v): v is number => v != null),
  );

  const hasAnyKpi =
    curDemandes != null ||
    curClosed != null ||
    curOpen != null ||
    curSlaClose != null ||
    curSlaPickup != null;

  if (!hasAnyKpi && prior.length === 0) {
    signals.push({
      kind: "data",
      severity: "warn",
      observation: "peu de chiffres disponibles (KPI non synchronisés)",
      recommendation: "lancer une sync Jira de la semaine",
    });
  }

  pushKpiSignal(
    signals,
    "Demandes IT",
    curDemandes,
    prevDemandes,
    baseDemandes,
    {
      higherIsWorse: true,
      recommendUp: "identifier la cause du pic de demandes",
      recommendDown: "profiter de la baisse pour absorber le backlog",
    },
  );

  pushKpiSignal(
    signals,
    "Tickets clôturés",
    curClosed,
    prevClosed,
    baseClosed,
    {
      higherIsWorse: false,
      recommendUp: undefined,
      recommendDown: "vérifier les bloqueurs de clôture",
    },
  );

  if (curOpen != null && significantDelta(curOpen, prevOpen ?? baseOpen)) {
    const up =
      (prevOpen != null && curOpen > prevOpen) ||
      (baseOpen != null && curOpen > baseOpen);
    signals.push({
      kind: "stock",
      severity: up ? "warn" : "info",
      observation: `stock non résolu ${up ? "en hausse" : "en baisse"} (${formatDelta(curOpen, prevOpen)})`,
      recommendation: up
        ? "prioriser le désendettement du stock"
        : "maintenir le rythme de baisse du stock",
    });
  }

  // SLA : un seul signal combiné si les deux bougent
  const slaCloseUp =
    curSlaClose != null &&
    significantDelta(curSlaClose, prevSlaClose ?? baseSlaClose) &&
    ((prevSlaClose != null && curSlaClose > prevSlaClose) ||
      (baseSlaClose != null && curSlaClose > baseSlaClose));
  const slaPickupUp =
    curSlaPickup != null &&
    significantDelta(curSlaPickup, prevSlaPickup ?? baseSlaPickup) &&
    ((prevSlaPickup != null && curSlaPickup > prevSlaPickup) ||
      (baseSlaPickup != null && curSlaPickup > baseSlaPickup));
  if (slaCloseUp || slaPickupUp) {
    const bits: string[] = [];
    if (slaCloseUp && curSlaClose != null) {
      bits.push(`clôture ${formatDelta(curSlaClose, prevSlaClose)}`);
    }
    if (slaPickupUp && curSlaPickup != null) {
      bits.push(`prise en charge ${formatDelta(curSlaPickup, prevSlaPickup)}`);
    }
    signals.push({
      kind: "sla",
      severity: "critical",
      observation: `hors SLA en hausse (${bits.join(", ")})`,
      recommendation: "analyser les dépassements de SLA",
    });
  } else {
    if (
      curSlaClose != null &&
      significantDelta(curSlaClose, prevSlaClose ?? baseSlaClose)
    ) {
      signals.push({
        kind: "sla",
        severity: "info",
        observation: `hors SLA clôture en baisse (${formatDelta(curSlaClose, prevSlaClose)})`,
      });
    }
    if (
      curSlaPickup != null &&
      significantDelta(curSlaPickup, prevSlaPickup ?? baseSlaPickup)
    ) {
      signals.push({
        kind: "sla",
        severity: "info",
        observation: `hors SLA prise en charge en baisse (${formatDelta(curSlaPickup, prevSlaPickup)})`,
      });
    }
  }

  // Throughput : créés vs clôturés
  if (curDemandes != null && curClosed != null && curDemandes > 0) {
    const gap = curDemandes - curClosed;
    if (gap >= KPI_DELTA_ABS) {
      signals.push({
        kind: "throughput",
        severity: "warn",
        observation: `plus de créations que de clôtures (+${gap})`,
        recommendation: "rééquilibrer créations et clôtures",
      });
    }
  }

  // Pics par type — garder le pire pic seulement
  const typeBag = db.ticketsByType[id] ?? {};
  let bestTypeSpike: WeekAnalysisSignal | null = null;
  for (const { name, count } of topEntries(typeBag, 12)) {
    if (count < TYPE_SPIKE_MIN) continue;
    const base = baselineForLabel(db.ticketsByType, name, priorKeys);
    let candidate: WeekAnalysisSignal | null = null;
    if (base <= 0) {
      if (count >= Math.max(TYPE_SPIKE_MIN, 5)) {
        candidate = {
          kind: "type_spike",
          severity: "warn",
          observation: `apparition du type « ${name} » (${count})`,
          recommendation: `clarifier l’origine de « ${name} »`,
        };
      }
    } else {
      const d = pctDelta(count, base);
      if (d != null && d >= TYPE_SPIKE_PCT) {
        candidate = {
          kind: "type_spike",
          severity: d >= 2 ? "critical" : "warn",
          observation: `pic sur « ${name} » (${count}, ${formatPct(d)})`,
          recommendation: `investiguer le pic « ${name} »`,
        };
      }
    }
    if (
      candidate &&
      (!bestTypeSpike ||
        (candidate.severity === "critical" && bestTypeSpike.severity !== "critical"))
    ) {
      bestTypeSpike = candidate;
    }
  }
  if (bestTypeSpike) signals.push(bestTypeSpike);

  // Charge : personne la plus chargée seulement
  const loadBag = db.openByAssignee?.[id] ?? db.ticketsByAssignee[id] ?? {};
  const loadSource = db.openByAssignee?.[id] ? "ouverts" : "créés";
  const loads = topEntries(loadBag, 20);
  if (loads.length >= 2) {
    const med = median(loads.map((l) => l.count));
    if (med != null && med > 0) {
      const overloaded = loads.find(
        (l) => l.count >= LOAD_MIN && l.count >= med * LOAD_RATIO,
      );
      if (overloaded) {
        signals.push({
          kind: "load",
          severity: overloaded.count >= med * 2 ? "critical" : "warn",
          observation: `surcharge de ${overloaded.name} (${overloaded.count} ${loadSource})`,
          recommendation: `redistribuer la charge de ${overloaded.name}`,
        });
      }
    }
  } else if (loads.length === 1 && loads[0].count >= LOAD_MIN) {
    signals.push({
      kind: "load",
      severity: "warn",
      observation: `concentration sur ${loads[0].name} (${loads[0].count} ${loadSource})`,
      recommendation: `prévoir un backup pour ${loads[0].name}`,
    });
  }

  // Si rien de notable : constat neutre
  if (signals.filter((s) => s.kind !== "data").length === 0) {
    const parts: string[] = [];
    if (curDemandes != null) parts.push(`${curDemandes} demandes`);
    if (curClosed != null) parts.push(`${curClosed} clôturés`);
    if (curOpen != null) parts.push(`stock ${curOpen}`);
    signals.push({
      kind: "kpi_delta",
      severity: "info",
      observation:
        parts.length > 0
          ? `semaine globalement stable (${parts.join(", ")})`
          : "pas d’écart marquant détecté sur les indicateurs disponibles",
      recommendation: "conserver le rythme actuel",
    });
  }

  const severityRank: Record<WeekAnalysisSeverity, number> = {
    critical: 0,
    warn: 1,
    info: 2,
  };
  signals.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity],
  );

  return {
    weekId: id,
    fluctuation: composeFluctuation(signals, week),
    recommandations: composeRecommendations(signals),
    signals,
  };
}

/** Jointure française courte : « A, B et C ». */
function joinFr(parts: string[]): string {
  const clean = parts.map((p) => p.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} et ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} et ${clean[clean.length - 1]}`;
}

function ensureSentence(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "";
  const capped = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?…]$/.test(capped) ? capped : `${capped}.`;
}

/**
 * Garde les signaux les plus graves en diversifiant les kinds
 * (ex. 1 SLA + 1 pic + 1 charge + 1 KPI) pour une phrase courte.
 */
function pickForProse(
  signals: WeekAnalysisSignal[],
  limit: number,
): WeekAnalysisSignal[] {
  const picked: WeekAnalysisSignal[] = [];
  const seenKinds = new Set<string>();
  for (const s of signals) {
    if (seenKinds.has(s.kind)) continue;
    seenKinds.add(s.kind);
    picked.push(s);
    if (picked.length >= limit) break;
  }
  // Si trop peu de kinds, compléter avec les suivants
  if (picked.length < limit) {
    for (const s of signals) {
      if (picked.includes(s)) continue;
      picked.push(s);
      if (picked.length >= limit) break;
    }
  }
  return picked;
}

/** Une phrase concise de fluctuation (max 4 constats). */
function composeFluctuation(
  signals: WeekAnalysisSignal[],
  weekNum: number,
): string {
  const selected = pickForProse(signals, 3);
  const observations = selected
    .map((s) => s.observation.trim())
    .filter(Boolean)
    .map((o) => o.replace(/[.;]\s*$/, ""));

  if (observations.length === 0) {
    return "Pas d’écart marquant détecté sur les indicateurs disponibles.";
  }

  // Cas « semaine stable » / data déjà formulé en phrase
  if (
    observations.length === 1 &&
    /stable|pas d’écart|Aucune donnée|Peu de chiffres/i.test(observations[0])
  ) {
    return ensureSentence(observations[0]);
  }

  const body = joinFr(
    observations.map((o) => o.charAt(0).toLowerCase() + o.slice(1)),
  );
  return ensureSentence(`S${String(weekNum).padStart(2, "0")} : ${body}`);
}

/** Une phrase concise de recommandations (max 3 actions). */
function composeRecommendations(signals: WeekAnalysisSignal[]): string {
  const selected = pickForProse(
    signals.filter((s) => s.recommendation?.trim()),
    3,
  );
  const recoSeen = new Set<string>();
  const actions = selected
    .map((s) => s.recommendation!.trim())
    .filter((r) => {
      const key = r.toLowerCase();
      if (recoSeen.has(key)) return false;
      recoSeen.add(key);
      return true;
    })
    .map((r) => r.replace(/[.;]\s*$/, ""))
    .map((r) => r.charAt(0).toLowerCase() + r.slice(1));

  if (actions.length === 0) {
    return "Aucune action prioritaire détectée — compléter avec le contexte métier si besoin.";
  }

  return ensureSentence(joinFr(actions));
}
