import { NextResponse } from "next/server";
import { buildWeekJql, fetchJiraWeekStats, weekKey } from "@/lib/jira";
import { resolveJiraConnection } from "@/lib/jira-auth";
import {
  backfillOpenAssigneeHistory,
  describeBrusselsNow,
  freezeOpenAssigneeForWeek,
  healUnfrozenCompletedWeeks,
  isOpenSnapshotWindow,
  weekToFreezeOpenSnapshot,
} from "@/lib/open-snapshot";
import {
  ensureWeek,
  updateWeeklyRow,
  setTicketsBreakdown,
  getWeek,
} from "@/lib/store";
import { weekId } from "@/lib/types";
import { authorizeCron } from "@/lib/api";

function summarizeHeal(
  healed: Awaited<ReturnType<typeof healUnfrozenCompletedWeeks>>,
) {
  return {
    healedCount: healed.processed.length,
    healed: healed.processed.map((r) => ({
      weekId: r.weekId,
      openCount: r.openCount,
      assignees: Object.keys(r.byAssignee).length,
      asOfDate: r.asOfDate,
      mode: r.mode,
    })),
    healSkipped: healed.skipped,
  };
}

/**
 * Figement du stock « non résolus » (+ ventilation par assigné) — dimanche 23:59 Europe/Brussels.
 *
 * Données figées :
 * - `demandesNonResoluesHebdo` + `openFrozenAt`
 * - ventilation `open_assignee` (stock ouvert par responsable)
 * - par défaut (`full` ≠ 0) : sync KPI hebdo + ventilations créés (type/assigné/demandeur)
 *
 * Vercel cron (UTC) : 21:55 et 22:55 le dimanche
 * → un des deux tombe dans 23:50–23:59 Bruxelles selon l’heure d’été/hiver.
 * Rattrapage lundi 00:00–00:14 aussi accepté.
 * Hors fenêtre : le 2ᵉ créneau DST tente quand même le rattrapage des semaines manquantes.
 *
 * Query:
 * - ?force=1 — figer hors fenêtre (semaine ISO précédente, snapshot live)
 * - ?backfill=1&weeks=40 — reconstituer les N semaines passées (JQL historique)
 * - ?skipExisting=1 — (avec backfill) ne pas écraser les semaines déjà figées
 * - ?heal=0 — désactiver le rattrapage des semaines non figées
 * - ?full=0 — ne figer que le stock ouvert (pas la sync KPI complète)
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";
  const backfill = searchParams.get("backfill") === "1";
  const heal = searchParams.get("heal") !== "0";
  const now = new Date();
  const brussels = describeBrusselsNow(now);

  const conn = await resolveJiraConnection();
  if (!conn) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Jira non configuré. Définir JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN sur Vercel.",
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

  let target = weekToFreezeOpenSnapshot(now);
  if (!target && force) {
    const { previousIsoWeek } = await import("@/lib/jira");
    target = {
      ...previousIsoWeek(now),
      reason: "force=1 — semaine ISO précédente",
    };
  }

  if (!target) {
    // Hors fenêtre live : le créneau DST « mort » sert de filet (semaines manquantes).
    let healSummary: ReturnType<typeof summarizeHeal> | null = null;
    if (heal) {
      try {
        healSummary = summarizeHeal(
          await healUnfrozenCompletedWeeks(conn, { lookback: 6, now }),
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Rattrapage semaines échoué";
        return NextResponse.json({ ok: false, error: message }, { status: 502 });
      }
    }
    return NextResponse.json({
      ok: true,
      skipped: true,
      brussels,
      inWindow: isOpenSnapshotWindow(now),
      message:
        "Hors fenêtre dimanche 23:50–23:59 (ou lundi 00:00–00:14) Europe/Brussels. Rattrapage des semaines non figées éventuel. Relancer avec ?force=1 pour un test, ou ?backfill=1 pour l’historique.",
      ...(healSummary ?? {}),
    });
  }

  const { year, week, reason } = target;
  const id = weekId({ year, month: 1, week });
  const jql = buildWeekJql(conn, year, week);

  try {
    const full = searchParams.get("full") !== "0";
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

    // Figement stock ouvert + ventilation par responsable (live à l’instant du cron)
    const frozen = await freezeOpenAssigneeForWeek(year, week, conn, {
      mode: "live",
      frozenAt: now,
    });

    let healSummary: ReturnType<typeof summarizeHeal> | null = null;
    if (heal) {
      healSummary = summarizeHeal(
        await healUnfrozenCompletedWeeks(conn, {
          lookback: 6,
          now,
          exclude: { year, week },
        }),
      );
    }

    const row = await getWeek(id);

    return NextResponse.json({
      ok: true,
      skipped: false,
      brussels,
      reason,
      weekId: id,
      openCount: frozen.openCount,
      openByAssignee: frozen.byAssignee,
      openFrozenAt: row?.openFrozenAt ?? frozen.openFrozenAt,
      jqlOpen: jql.open,
      ...extras,
      ...(healSummary ?? {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Snapshot échoué";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
