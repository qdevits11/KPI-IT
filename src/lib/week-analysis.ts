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
  let vsBase = "";
  if (baseline != null && baseline > 0) {
    const d = pctDelta(current, baseline);
    if (d != null && Math.abs(d) >= KPI_DELTA_PCT) {
      vsBase = ` · vs moy. ${BASELINE_WEEKS} sem. ${formatPct(d)}`;
    }
  }

  const up = previous != null ? current > previous : baseline != null && current > baseline;
  const severity: WeekAnalysisSeverity =
    higherIsWorse && up
      ? "warn"
      : !higherIsWorse && !up
        ? "warn"
        : "info";

  const observation = `${label} : ${vsPrev}${vsBase}`;
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
        "Aucune donnée pour cette semaine. Lancez une synchronisation Jira avant de générer l’analyse.",
      recommandations:
        "Synchroniser la semaine depuis Admin → Opérations, puis régénérer l’analyse.",
      signals: [
        {
          kind: "data",
          severity: "critical",
          observation: "Semaine absente de la base.",
          recommendation: "Synchroniser Jira pour cette semaine.",
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
      observation:
        "Peu de chiffres disponibles pour cette semaine (KPI non synchronisés).",
      recommendation:
        "Lancer une sync Jira de la semaine pour enrichir fluctuation et recommandations.",
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
      recommendUp:
        "Identifier la cause du pic de demandes (type, demandeur) et arbitrer la capacité.",
      recommendDown:
        "Capitaliser sur la baisse de volume pour absorber le backlog ou avancer les sujets structurants.",
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
      recommendDown:
        "Vérifier la capacité de clôture et les éventuels bloqueurs (attente métier, dépendances).",
    },
  );

  if (curOpen != null && significantDelta(curOpen, prevOpen ?? baseOpen)) {
    const up =
      (prevOpen != null && curOpen > prevOpen) ||
      (baseOpen != null && curOpen > baseOpen);
    signals.push({
      kind: "stock",
      severity: up ? "warn" : "info",
      observation: `Stock non résolu : ${formatDelta(curOpen, prevOpen)}${
        baseOpen != null && baseOpen > 0
          ? ` · vs moy. ${formatPct(pctDelta(curOpen, baseOpen) ?? 0)}`
          : ""
      }`,
      recommendation: up
        ? "Prioriser le désendettement du stock (tri, redistribution, clôture des plus anciens)."
        : "Maintenir le rythme qui a permis de faire baisser le stock.",
    });
  }

  if (
    curSlaClose != null &&
    significantDelta(curSlaClose, prevSlaClose ?? baseSlaClose)
  ) {
    const up =
      (prevSlaClose != null && curSlaClose > prevSlaClose) ||
      (baseSlaClose != null && curSlaClose > baseSlaClose);
    signals.push({
      kind: "sla",
      severity: up ? "critical" : "info",
      observation: `Hors SLA clôture : ${formatDelta(curSlaClose, prevSlaClose)}`,
      recommendation: up
        ? "Analyser les tickets hors SLA clôture et les causes (charge, complexité, attente)."
        : undefined,
    });
  }

  if (
    curSlaPickup != null &&
    significantDelta(curSlaPickup, prevSlaPickup ?? baseSlaPickup)
  ) {
    const up =
      (prevSlaPickup != null && curSlaPickup > prevSlaPickup) ||
      (baseSlaPickup != null && curSlaPickup > baseSlaPickup);
    signals.push({
      kind: "sla",
      severity: up ? "critical" : "info",
      observation: `Hors SLA prise en charge : ${formatDelta(curSlaPickup, prevSlaPickup)}`,
      recommendation: up
        ? "Revoir la prise en charge initiale (astreinte, file d’attente, règles d’assignation)."
        : undefined,
    });
  }

  // Throughput : créés vs clôturés
  if (curDemandes != null && curClosed != null && curDemandes > 0) {
    const gap = curDemandes - curClosed;
    if (gap >= KPI_DELTA_ABS) {
      signals.push({
        kind: "throughput",
        severity: "warn",
        observation: `Écart création / clôture : +${gap} (créés ${curDemandes}, clôturés ${curClosed})`,
        recommendation:
          "Rééquilibrer : freiner les nouvelles prises ou accélérer les clôtures sur les sujets à fort volume.",
      });
    }
  }

  // Pics par type
  const typeBag = db.ticketsByType[id] ?? {};
  const typeEntries = topEntries(typeBag, 12);
  for (const { name, count } of typeEntries) {
    if (count < TYPE_SPIKE_MIN) continue;
    const base = baselineForLabel(db.ticketsByType, name, priorKeys);
    if (base <= 0) {
      if (count >= Math.max(TYPE_SPIKE_MIN, 5)) {
        signals.push({
          kind: "type_spike",
          severity: "warn",
          observation: `Nouveau / rare type « ${name} » : ${count} ticket(s) cette semaine`,
          recommendation: `Clarifier l’origine du sujet « ${name} » (régression, besoin métier, manque de doc).`,
        });
      }
      continue;
    }
    const d = pctDelta(count, base);
    if (d != null && d >= TYPE_SPIKE_PCT) {
      signals.push({
        kind: "type_spike",
        severity: d >= 2 ? "critical" : "warn",
        observation: `Pic type « ${name} » : ${count} (moy. ${base.toFixed(1)}, ${formatPct(d)})`,
        recommendation: `Investiguer le pic « ${name} » et décider : correctif, automatisation ou communication métier.`,
      });
    }
  }

  // Charge par personne (stock figé si dispo, sinon créés)
  const loadBag = db.openByAssignee?.[id] ?? db.ticketsByAssignee[id] ?? {};
  const loadSource = db.openByAssignee?.[id]
    ? "stock ouvert"
    : "tickets créés assignés";
  const loads = topEntries(loadBag, 20);
  if (loads.length >= 2) {
    const med = median(loads.map((l) => l.count));
    if (med != null && med > 0) {
      for (const { name, count } of loads) {
        if (count < LOAD_MIN) continue;
        if (count >= med * LOAD_RATIO) {
          signals.push({
            kind: "load",
            severity: count >= med * 2 ? "critical" : "warn",
            observation: `Charge élevée — ${name} : ${count} (${loadSource}, médiane équipe ${med.toFixed(0)})`,
            recommendation: `Redistribuer une partie du portefeuille de ${name} ou suspendre les nouvelles assignations.`,
          });
        }
      }
    }
  } else if (loads.length === 1 && loads[0].count >= LOAD_MIN) {
    signals.push({
      kind: "load",
      severity: "warn",
      observation: `Concentration — ${loads[0].name} porte ${loads[0].count} ticket(s) (${loadSource})`,
      recommendation: `Prévoir un backup / binômage autour de ${loads[0].name}.`,
    });
  }

  // Si rien de notable : constat neutre
  if (signals.filter((s) => s.kind !== "data").length === 0) {
    const parts: string[] = [];
    if (curDemandes != null) parts.push(`demandes ${curDemandes}`);
    if (curClosed != null) parts.push(`clôturés ${curClosed}`);
    if (curOpen != null) parts.push(`stock ${curOpen}`);
    signals.push({
      kind: "kpi_delta",
      severity: "info",
      observation:
        parts.length > 0
          ? `Semaine globalement stable (${parts.join(" · ")})${
              previous ? ` vs S${String(previous.week).padStart(2, "0")}` : ""
            }.`
          : "Pas d’écart marquant détecté sur les indicateurs disponibles.",
      recommendation:
        "Conserver le rythme actuel et documenter tout point qualitatif utile pour l’historique.",
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

  const fluctuation = signals
    .map((s) => `• ${s.observation}`)
    .join("\n");

  const recoSeen = new Set<string>();
  const recommandations = signals
    .map((s) => s.recommendation?.trim())
    .filter((r): r is string => Boolean(r))
    .filter((r) => {
      if (recoSeen.has(r)) return false;
      recoSeen.add(r);
      return true;
    })
    .slice(0, 6)
    .map((r) => `• ${r}`)
    .join("\n");

  return {
    weekId: id,
    fluctuation,
    recommandations:
      recommandations ||
      "• Aucune action prioritaire détectée automatiquement — compléter si besoin avec le contexte métier.",
    signals,
  };
}
