import { NextResponse } from "next/server";
import { buildWeekJql, fetchJiraWeekStats, weekKey } from "@/lib/jira";
import { resolveJiraConnection } from "@/lib/jira-auth";
import {
  backfillOpenAssigneeHistory,
  describeBrusselsNow,
  ensureWeeklyOpenFreezeInApp,
  freezeOpenAssigneeForWeek,
  weekToFreezeOpenSnapshot,
} from "@/lib/open-snapshot";
import {
  ensureWeek,
  updateWeeklyRow,
  setTicketsBreakdown,
  getWeek,
} from "@/lib/store";
import { weekId } from "@/lib/types";
import { requireAdminApi } from "@/lib/api";

/**
 * Figement manuel (admin, session) — le figement automatique se fait
 * dans l’app via `ensureWeeklyOpenFreezeInApp` (chargement KPI / sync).
 *
 * Query:
 * - (défaut) — lance le même ensure que l’app
 * - ?force=1 — figer la semaine ISO précédente (snapshot live)
 * - ?backfill=1&weeks=40 — reconstituer les N semaines passées (JQL historique)
 * - ?skipExisting=1 — (avec backfill) ne pas écraser les semaines déjà figées
 * - ?full=1 — avec force : sync KPI + ventilations créés avant figement open
 */
export async function GET(request: Request) {
  const gate = await requireAdminApi();
  if ("response" in gate) return gate.response;

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";
  const backfill = searchParams.get("backfill") === "1";
  const now = new Date();
  const brussels = describeBrusselsNow(now);

  const conn = await resolveJiraConnection();
  if (!conn) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Jira non configuré. Connectez le compte partagé (Admin → Intégration Jira).",
      },
      { status: 401 },
    );
  }

  if (backfill) {
    const weeks = Math.max(
      1,
      Math.min(104, Number(searchParams.get("weeks") || 40) || 40),
    );
    const skipExisting = searchParams.get("skipExisting") === "1";
    try {
      const result = await backfillOpenAssigneeHistory(conn, {
        weeks,
        skipExisting,
        now,
      });
      return NextResponse.json({
        ok: true,
        backfill: true,
        brussels,
        weeksRequested: weeks,
        skipExisting,
        processed: result.processed.map((r) => ({
          weekId: r.weekId,
          openCount: r.openCount,
          assignees: Object.keys(r.byAssignee).length,
          asOfDate: r.asOfDate,
        })),
        skipped: result.skipped,
        processedCount: result.processed.length,
        skippedCount: result.skipped.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Backfill échoué";
      return NextResponse.json({ ok: false, error: message }, { status: 502 });
    }
  }

  if (!force) {
    const ensured = await ensureWeeklyOpenFreezeInApp({ force: true, now });
    return NextResponse.json({
      mode: "in-app-ensure",
      brussels,
      ...ensured,
    });
  }

  let target = weekToFreezeOpenSnapshot(now);
  if (!target) {
    const { previousIsoWeek } = await import("@/lib/jira");
    target = {
      ...previousIsoWeek(now),
      reason: "force=1 — semaine ISO précédente",
    };
  }

  const { year, week, reason } = target;
  const id = weekId({ year, month: 1, week });
  const jql = buildWeekJql(conn, year, week);

  try {
    const full = searchParams.get("full") === "1";
    let extras: Record<string, unknown> = {};
    if (full) {
      const stats = await fetchJiraWeekStats(year, week, conn);
      await ensureWeek(id);
      await updateWeeklyRow(id, {
        ...stats.patch,
      });
      await setTicketsBreakdown(
        weekKey(year, week),
        stats.byType,
        stats.byAssignee,
        stats.byRequester,
      );
      extras = {
        demandesItHebdo: stats.patch.demandesItHebdo,
        ticketsHorsSlaCloture: stats.patch.ticketsHorsSlaCloture,
        ticketsHorsSlaPriseEnCharge: stats.patch.ticketsHorsSlaPriseEnCharge,
      };
    }

    const frozen = await freezeOpenAssigneeForWeek(year, week, conn, {
      mode: "live",
      frozenAt: now,
    });

    const row = await getWeek(id);

    return NextResponse.json({
      ok: true,
      mode: "force",
      brussels,
      reason,
      weekId: id,
      openCount: frozen.openCount,
      openByAssignee: frozen.byAssignee,
      openFrozenAt: row?.openFrozenAt ?? frozen.openFrozenAt,
      jqlOpen: jql.open,
      ...extras,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Snapshot échoué";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
