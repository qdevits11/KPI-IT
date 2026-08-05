import { NextResponse } from "next/server";
import {
  fetchJiraWeekStats,
  mockJiraWeekStats,
  weekKey,
  buildWeekJql,
  isoWeekDateRange,
  type JiraWeekSyncResult,
} from "@/lib/jira";
import {
  resolveJiraConnection,
  sanitizeConnection,
} from "@/lib/jira-auth";
import {
  updateWeeklyRow,
  setTicketsBreakdown,
  currentWeekId,
  ensureWeek,
  getDatabase,
} from "@/lib/store";
import { buildWeekDashboard } from "@/lib/formulas";
import { weekId, parseWeekId } from "@/lib/types";
import excelSeed from "@/data/seed-from-excel.json";
import { isIsoWeekCompleted } from "@/lib/open-snapshot";
import type { WeeklyRow } from "@/lib/types";

function excelBaseline(year: number, week: number) {
  const row = (
    excelSeed as {
      weeks: Array<{
        year: number;
        week: number;
        demandesItHebdo: number | null;
        demandesNonResoluesHebdo: number | null;
        ticketsHorsSlaCloture: number | null;
        ticketsHorsSlaPriseEnCharge: number | null;
      }>;
    }
  ).weeks.find((w) => w.year === year && w.week === week);
  if (!row) return null;
  return {
    demandesItHebdo: row.demandesItHebdo,
    demandesNonResoluesHebdo: row.demandesNonResoluesHebdo,
    ticketsHorsSlaCloture: row.ticketsHorsSlaCloture,
    ticketsHorsSlaPriseEnCharge: row.ticketsHorsSlaPriseEnCharge,
  };
}

/**
 * Pour une semaine terminée déjà figée : on garde le stock dimanche 23:59.
 * Semaine courante : snapshot live.
 */
function applyOpenSnapshotPolicy(
  year: number,
  week: number,
  patch: JiraWeekSyncResult["patch"],
  existing: WeeklyRow | null,
  forceOpenLive: boolean,
): {
  patch: JiraWeekSyncResult["patch"];
  openMode: "live" | "frozen" | "preserved";
  warnings: string[];
} {
  const warnings: string[] = [];
  const completed = isIsoWeekCompleted(year, week);
  const liveOpen = patch.demandesNonResoluesHebdo;

  if (!completed) {
    warnings.push(
      "Non résolus = snapshot live (semaine en cours). Figement auto dimanche 23:59 Europe/Brussels via cron.",
    );
    return { patch, openMode: "live", warnings };
  }

  if (
    !forceOpenLive &&
    existing?.openFrozenAt &&
    existing.demandesNonResoluesHebdo != null
  ) {
    warnings.push(
      `Non résolus conservés (figés ${existing.openFrozenAt}) = ${existing.demandesNonResoluesHebdo}. Live Jira maintenant = ${liveOpen}. Cron dimanche 23:59 Bruxelles.`,
    );
    return {
      patch: {
        ...patch,
        demandesNonResoluesHebdo: existing.demandesNonResoluesHebdo,
      },
      openMode: "preserved",
      warnings,
    };
  }

  if (
    !forceOpenLive &&
    completed &&
    existing?.demandesNonResoluesHebdo != null &&
    !existing.openFrozenAt
  ) {
    // Valeur Excel / manuelle sans marqueur : la protéger aussi
    warnings.push(
      `Non résolus conservés (valeur existante ${existing.demandesNonResoluesHebdo}, semaine terminée). Live = ${liveOpen}.`,
    );
    return {
      patch: {
        ...patch,
        demandesNonResoluesHebdo: existing.demandesNonResoluesHebdo,
        openFrozenAt: existing.openFrozenAt ?? "preserved-existing",
      },
      openMode: "preserved",
      warnings,
    };
  }

  warnings.push(
    forceOpenLive
      ? `Non résolus écrasés par le live Jira (${liveOpen}) — forceOpenLive.`
      : `Non résolus = live Jira (${liveOpen}) — pas encore de figement cron pour cette semaine.`,
  );
  return { patch, openMode: forceOpenLive ? "live" : "live", warnings };
}

function resolveTargetWeek(body: {
  weekId?: string;
  year?: number;
  week?: number;
}): { id: string; year: number; week: number } | { error: string } {
  if (
    typeof body.year === "number" &&
    typeof body.week === "number" &&
    Number.isFinite(body.year) &&
    Number.isFinite(body.week)
  ) {
    const year = Math.trunc(body.year);
    const week = Math.trunc(body.week);
    if (year < 2000 || year > 2100) {
      return { error: "Année invalide (2000–2100)." };
    }
    if (week < 1 || week > 53) {
      return { error: "Numéro de semaine invalide (1–53)." };
    }
    return {
      year,
      week,
      id: `${year}-S${String(week).padStart(2, "0")}`,
    };
  }

  try {
    const id = body.weekId ?? currentWeekId();
    const { year, week } = parseWeekId(id);
    return { id, year, week };
  } catch {
    return { error: "weekId invalide (format attendu: 2026-S31)." };
  }
}

function valuesFromPatch(result: JiraWeekSyncResult) {
  return {
    demandesItHebdo: result.patch.demandesItHebdo ?? 0,
    demandesNonResoluesHebdo: result.patch.demandesNonResoluesHebdo ?? 0,
    ticketsHorsSlaCloture: result.patch.ticketsHorsSlaCloture ?? 0,
    ticketsHorsSlaPriseEnCharge: result.patch.ticketsHorsSlaPriseEnCharge ?? 0,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get("week");
  const yearParam = searchParams.get("year");
  const weekNumParam = searchParams.get("weekNum");
  const conn = await resolveJiraConnection();

  let year: number | null = null;
  let week: number | null = null;
  if (yearParam && weekNumParam) {
    const y = Number(yearParam);
    const w = Number(weekNumParam);
    if (Number.isFinite(y) && Number.isFinite(w) && w >= 1 && w <= 53) {
      year = y;
      week = w;
    }
  } else if (weekParam) {
    try {
      const parsed = parseWeekId(weekParam);
      year = parsed.year;
      week = parsed.week;
    } catch {
      // ignore
    }
  }

  const previewJql =
    conn && year != null && week != null
      ? buildWeekJql(conn, year, week)
      : null;
  const dateRange =
    year != null && week != null ? isoWeekDateRange(year, week) : null;

  return NextResponse.json({
    configured: Boolean(conn),
    connection: conn ? sanitizeConnection(conn) : null,
    previewJql,
    dateRange,
    weekId:
      year != null && week != null
        ? `${year}-S${String(week).padStart(2, "0")}`
        : null,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    weekId?: string;
    year?: number;
    week?: number;
    useMock?: boolean;
    /** true = calcule sans écrire en base */
    dryRun?: boolean;
    /** true = écraser le stock figé par le snapshot live */
    forceOpenLive?: boolean;
  };

  const target = resolveTargetWeek(body);
  if ("error" in target) {
    return NextResponse.json({ ok: false, error: target.error }, { status: 400 });
  }

  const { id, year, week } = target;
  const dryRun = Boolean(body.dryRun);
  const forceOpenLive = Boolean(body.forceOpenLive);
  const conn = await resolveJiraConnection();

  try {
    if (body.useMock) {
      const result = mockJiraWeekStats(year, week);
      const existing = (await getDatabase()).weeks.find(
        (w) => weekId(w) === id,
      ) ?? null;
      const policy = applyOpenSnapshotPolicy(
        year,
        week,
        result.patch,
        existing,
        forceOpenLive,
      );
      const merged = {
        ...result,
        patch: policy.patch,
        warnings: [...result.warnings, ...policy.warnings],
      };
      const values = valuesFromPatch(merged);

      if (!dryRun) {
        await ensureWeek(id);
        await updateWeeklyRow(id, merged.patch);
        await setTicketsBreakdown(
          weekKey(year, week),
          result.byType,
          result.byAssignee,
        );
      }

      const db = await getDatabase();
      const row =
        db.weeks.find((w) => weekId(w) === id) ??
        ({
          year,
          month: Math.min(12, Math.ceil(week / 4.345)),
          week,
          ...merged.patch,
        } as never);

      return NextResponse.json({
        ok: true,
        mode: "mock",
        dryRun,
        openMode: policy.openMode,
        weekId: id,
        year,
        week,
        values,
        excelBaseline: excelBaseline(year, week),
        dashboard: dryRun ? null : buildWeekDashboard(db, row),
        jql: result.jql,
        warnings: merged.warnings,
        probe: result.probe,
        diagnostics: result.diagnostics,
      });
    }

    if (!conn) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Connectez d'abord votre compte Jira (email + token API Atlassian).",
        },
        { status: 401 },
      );
    }

    const result = await fetchJiraWeekStats(year, week, conn);
    await ensureWeek(id);
    const existing =
      (await getDatabase()).weeks.find((w) => weekId(w) === id) ?? null;
    const policy = applyOpenSnapshotPolicy(
      year,
      week,
      result.patch,
      existing,
      forceOpenLive,
    );
    const merged = {
      ...result,
      patch: policy.patch,
      warnings: [...result.warnings, ...policy.warnings],
    };
    const values = valuesFromPatch(merged);

    if (!dryRun) {
      await updateWeeklyRow(id, merged.patch);
      await setTicketsBreakdown(
        weekKey(year, week),
        result.byType,
        result.byAssignee,
      );
    }

    const db = await getDatabase();
    const row =
      db.weeks.find((w) => weekId(w) === id) ??
      ({
        year,
        month: Math.min(12, Math.ceil(week / 4.345)),
        week,
        ...merged.patch,
      } as never);

    return NextResponse.json({
      ok: true,
      mode: "jira",
      dryRun,
      openMode: policy.openMode,
      weekId: id,
      year,
      week,
      values,
      excelBaseline: excelBaseline(year, week),
      dashboard: dryRun ? null : buildWeekDashboard(db, row),
      jql: result.jql,
      warnings: merged.warnings,
      probe: result.probe,
      diagnostics: {
        ...result.diagnostics,
        openCountLive: result.diagnostics.openCount,
        openCountStored: values.demandesNonResoluesHebdo,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur Jira";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
