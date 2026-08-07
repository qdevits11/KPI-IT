import {
  BUSINESS_TIMEZONE,
  brusselsWallToUtc,
  toBrusselsDateStr,
} from "./business-hours";
import {
  resolveJiraConnection,
  type JiraConnection,
} from "./jira-auth";
import {
  currentIsoWeek,
  isoWeekDateRange,
  previousIsoWeek,
  weekKey,
} from "./jira";
import { countsByAssignee } from "./open-assignee";
import {
  fetchOpenTicketsAsOf,
  fetchOpenTicketsSnapshot,
} from "./jira-tickets";
import {
  ensureWeek,
  getOpenByAssignee,
  getWeek,
  setOpenByAssignee,
  updateWeeklyRow,
} from "./store";
import { weekId } from "./types";

/** Parties calendrier Europe/Brussels */
function brusselsParts(date: Date): {
  weekday: number;
  hour: number;
  minute: number;
  year: number;
  month: number;
  day: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const wd: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    weekday: wd[get("weekday")] ?? 0,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

/**
 * Fenêtre de figement : dimanche 23:50–23:59 Bruxelles,
 * ou rattrapage lundi 00:00–00:14.
 */
export function isOpenSnapshotWindow(now = new Date()): boolean {
  const p = brusselsParts(now);
  if (p.weekday === 0 && p.hour === 23 && p.minute >= 50) return true;
  if (p.weekday === 1 && p.hour === 0 && p.minute < 15) return true;
  return false;
}

/**
 * Semaine ISO à figer pour le stock « non résolus ».
 * - Dimanche soir → semaine courante (qui se termine à minuit)
 * - Lundi tout début → semaine précédente
 */
export function weekToFreezeOpenSnapshot(
  now = new Date(),
): { year: number; week: number; reason: string } | null {
  const p = brusselsParts(now);
  if (p.weekday === 0 && p.hour === 23 && p.minute >= 50) {
    // Ancrer à dimanche midi Bruxelles pour l'ISO week
    const sundayNoon = brusselsWallToUtc(p.year, p.month, p.day, 12, 0, 0);
    const cur = currentIsoWeek(sundayNoon);
    return {
      ...cur,
      reason: "dimanche 23:50+ Europe/Brussels — fin de semaine ISO",
    };
  }
  if (p.weekday === 1 && p.hour === 0 && p.minute < 15) {
    // Ancrer à midi Bruxelles du lundi pour éviter le décalage UTC/CEST
    const mondayNoon = brusselsWallToUtc(p.year, p.month, p.day, 12, 0, 0);
    const prev = previousIsoWeek(mondayNoon);
    return {
      ...prev,
      reason: "lundi 00:00–00:14 Europe/Brussels — rattrapage",
    };
  }
  return null;
}

/** La semaine ISO est terminée (maintenant ≥ lundi suivant 00:00 Bruxelles). */
export function isIsoWeekCompleted(
  year: number,
  week: number,
  now = new Date(),
): boolean {
  const { endExclusive } = isoWeekDateRange(year, week);
  const [y, m, d] = endExclusive.split("-").map(Number);
  const end = brusselsWallToUtc(y!, m!, d!, 0, 0, 0, 0);
  return now.getTime() >= end.getTime();
}

export function describeBrusselsNow(now = new Date()): string {
  const p = brusselsParts(now);
  const days = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
  return `${days[p.weekday]} ${toBrusselsDateStr(now)} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")} ${BUSINESS_TIMEZONE}`;
}

export type OpenAssigneeFreezeResult = {
  weekId: string;
  year: number;
  week: number;
  asOfDate: string;
  openCount: number;
  byAssignee: Record<string, number>;
  openFrozenAt: string;
  mode: "live" | "historical";
  jql: string;
  warnings: string[];
};

/**
 * Fige le stock ouvert (+ ventilation par assigné) pour une semaine ISO terminée.
 * - `live` : snapshot Jira courant (fenêtre dimanche soir / force admin)
 * - `historical` : JQL `status WAS … ON` dimanche de fin de semaine
 */
export async function freezeOpenAssigneeForWeek(
  year: number,
  week: number,
  conn: JiraConnection,
  options?: { mode?: "live" | "historical"; frozenAt?: Date },
): Promise<OpenAssigneeFreezeResult> {
  const mode = options?.mode ?? "live";
  const frozenAt = options?.frozenAt ?? new Date();
  const { endInclusive } = isoWeekDateRange(year, week);
  const id = weekId({ year, month: 1, week });
  const key = weekKey(year, week);

  const snap =
    mode === "live"
      ? await fetchOpenTicketsSnapshot(conn)
      : await fetchOpenTicketsAsOf(endInclusive, conn);

  const byAssignee = countsByAssignee(snap.byAssignee);
  const openCount = snap.total;
  const openFrozenAt = frozenAt.toISOString();

  await ensureWeek(id);
  await updateWeeklyRow(id, {
    demandesNonResoluesHebdo: openCount,
    openFrozenAt,
  });
  await setOpenByAssignee(key, byAssignee);

  return {
    weekId: id,
    year,
    week,
    asOfDate: endInclusive,
    openCount,
    byAssignee,
    openFrozenAt,
    mode,
    jql: snap.jql,
    warnings: snap.warnings,
  };
}

/** Liste les semaines ISO complétées à backfiller (plus récente d’abord). */
export function listCompletedWeeksToBackfill(
  count: number,
  now = new Date(),
): { year: number; week: number }[] {
  const n = Math.max(0, Math.min(104, Math.floor(count)));
  const out: { year: number; week: number }[] = [];
  let cursor = previousIsoWeek(now);
  for (let i = 0; i < n; i++) {
    if (!isIsoWeekCompleted(cursor.year, cursor.week, now)) break;
    out.push(cursor);
    const { start } = isoWeekDateRange(cursor.year, cursor.week);
    const [y, m, d] = start.split("-").map(Number);
    // Un jour avant le lundi de la semaine → tombe dans la semaine précédente
    const prevDay = new Date(Date.UTC(y!, m! - 1, d! - 1));
    cursor = currentIsoWeek(prevDay);
  }
  return out;
}

/**
 * Recalcule le stock ouvert figé + open_assignee pour N semaines passées.
 */
export async function backfillOpenAssigneeHistory(
  conn: JiraConnection,
  options?: {
    weeks?: number;
    skipExisting?: boolean;
    now?: Date;
  },
): Promise<{
  processed: OpenAssigneeFreezeResult[];
  skipped: string[];
}> {
  const weeks = options?.weeks ?? 40;
  const skipExisting = options?.skipExisting ?? false;
  const now = options?.now ?? new Date();
  const targets = listCompletedWeeksToBackfill(weeks, now);
  const processed: OpenAssigneeFreezeResult[] = [];
  const skipped: string[] = [];

  for (const target of targets) {
    const id = weekId({ year: target.year, month: 1, week: target.week });
    if (skipExisting) {
      const bag = await getOpenByAssignee(id);
      if (Object.keys(bag).length > 0) {
        skipped.push(id);
        continue;
      }
    }

    const result = await freezeOpenAssigneeForWeek(
      target.year,
      target.week,
      conn,
      { mode: "historical", frozenAt: now },
    );
    processed.push(result);
  }

  return { processed, skipped };
}

/** Une semaine terminée doit être figée si le marqueur ou la ventilation manque. */
export async function weekNeedsOpenFreeze(
  year: number,
  week: number,
): Promise<boolean> {
  const id = weekId({ year, month: 1, week });
  const row = await getWeek(id);
  if (!row?.openFrozenAt) return true;
  const bag = await getOpenByAssignee(id);
  return Object.keys(bag).length === 0;
}

/**
 * Rattrapage : fige (mode historique) les semaines ISO terminées récentes
 * encore sans `openFrozenAt` / `open_assignee`.
 */
export async function healUnfrozenCompletedWeeks(
  conn: JiraConnection,
  options?: {
    /** Nombre max de semaines terminées à inspecter (défaut 6). */
    lookback?: number;
    now?: Date;
    /** Semaine déjà figée en live dans le même run — à ignorer. */
    exclude?: { year: number; week: number };
  },
): Promise<{
  processed: OpenAssigneeFreezeResult[];
  skipped: string[];
}> {
  const lookback = Math.max(0, Math.min(26, options?.lookback ?? 6));
  const now = options?.now ?? new Date();
  const exclude = options?.exclude;
  const targets = listCompletedWeeksToBackfill(lookback, now);
  const processed: OpenAssigneeFreezeResult[] = [];
  const skipped: string[] = [];

  for (const target of targets) {
    if (
      exclude &&
      exclude.year === target.year &&
      exclude.week === target.week
    ) {
      skipped.push(weekId({ year: target.year, month: 1, week: target.week }));
      continue;
    }
    const id = weekId({ year: target.year, month: 1, week: target.week });
    if (!(await weekNeedsOpenFreeze(target.year, target.week))) {
      skipped.push(id);
      continue;
    }
    const result = await freezeOpenAssigneeForWeek(
      target.year,
      target.week,
      conn,
      { mode: "historical", frozenAt: now },
    );
    processed.push(result);
  }

  return { processed, skipped };
}


export type InAppFreezeResult = {
  ok: boolean;
  /** true si un appel Jira / écriture a eu lieu */
  ran: boolean;
  reason?: string;
  live?: OpenAssigneeFreezeResult | null;
  healed?: OpenAssigneeFreezeResult[];
  error?: string;
};

let ensureInflight: Promise<InAppFreezeResult> | null = null;
let ensureLastDoneAt = 0;
const ENSURE_THROTTLE_MS = 45_000;

async function anyCompletedWeekNeedsFreeze(
  lookback: number,
  now: Date,
  exclude?: { year: number; week: number },
): Promise<boolean> {
  for (const target of listCompletedWeeksToBackfill(lookback, now)) {
    if (
      exclude &&
      exclude.year === target.year &&
      exclude.week === target.week
    ) {
      continue;
    }
    if (await weekNeedsOpenFreeze(target.year, target.week)) return true;
  }
  return false;
}

/**
 * Figement **dans l’app** (pas d’appel HTTP externe / cron Vercel).
 * Déclenché au chargement des KPI : fige la semaine qui se termine (fenêtre
 * dimanche soir) et rattrape les semaines terminées encore ouvertes.
 *
 * Débouncé : une seule exécution concurrente + throttle ~45s.
 * Les erreurs Jira sont renvoyées sans faire planter la page.
 */
export async function ensureWeeklyOpenFreezeInApp(options?: {
  now?: Date;
  lookback?: number;
  force?: boolean;
}): Promise<InAppFreezeResult> {
  if (ensureInflight) return ensureInflight;
  if (
    !options?.force &&
    Date.now() - ensureLastDoneAt < ENSURE_THROTTLE_MS
  ) {
    return { ok: true, ran: false, reason: "throttled" };
  }

  ensureInflight = runEnsureWeeklyOpenFreezeInApp(options).finally(() => {
    ensureInflight = null;
  });
  return ensureInflight;
}

async function runEnsureWeeklyOpenFreezeInApp(options?: {
  now?: Date;
  lookback?: number;
}): Promise<InAppFreezeResult> {
  const now = options?.now ?? new Date();
  const lookback = Math.max(1, Math.min(26, options?.lookback ?? 6));

  try {
    const liveTarget = weekToFreezeOpenSnapshot(now);
    const needsHeal = await anyCompletedWeekNeedsFreeze(
      lookback,
      now,
      liveTarget
        ? { year: liveTarget.year, week: liveTarget.week }
        : undefined,
    );

    if (!liveTarget && !needsHeal) {
      ensureLastDoneAt = Date.now();
      return { ok: true, ran: false, reason: "nothing-to-freeze" };
    }

    const conn = await resolveJiraConnection();
    if (!conn) {
      ensureLastDoneAt = Date.now();
      return {
        ok: false,
        ran: false,
        reason: "jira-unconfigured",
        error: "Jira non configuré — figement reporté.",
      };
    }

    let live: OpenAssigneeFreezeResult | null = null;
    if (liveTarget) {
      // Dimanche 23:50+ / lundi 00:00–00:14 : snapshot live de fin de semaine
      live = await freezeOpenAssigneeForWeek(
        liveTarget.year,
        liveTarget.week,
        conn,
        { mode: "live", frozenAt: now },
      );
    }

    const healed = needsHeal
      ? await healUnfrozenCompletedWeeks(conn, {
          lookback,
          now,
          exclude: liveTarget
            ? { year: liveTarget.year, week: liveTarget.week }
            : undefined,
        })
      : { processed: [], skipped: [] };

    ensureLastDoneAt = Date.now();
    return {
      ok: true,
      ran: Boolean(live) || healed.processed.length > 0,
      reason: liveTarget?.reason,
      live,
      healed: healed.processed,
    };
  } catch (err) {
    ensureLastDoneAt = Date.now();
    return {
      ok: false,
      ran: true,
      error: err instanceof Error ? err.message : "Figement échoué",
    };
  }
}

/** Remise à zéro du throttle (tests). */
export function resetEnsureWeeklyOpenFreezeStateForTests(): void {
  ensureInflight = null;
  ensureLastDoneAt = 0;
}
