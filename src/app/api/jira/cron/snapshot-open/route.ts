import { NextResponse } from "next/server";
import { countJql, buildWeekJql, weekKey, fetchJiraWeekStats } from "@/lib/jira";
import { resolveJiraConnection } from "@/lib/jira-auth";
import {
  describeBrusselsNow,
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

/**
 * Figement du stock « non résolus » — dimanche 23:59 Europe/Brussels.
 *
 * Vercel cron (UTC) : 21:55 et 22:55 le dimanche
 * → un des deux tombe dans 23:50–23:59 Bruxelles selon l’heure d’été/hiver.
 * Rattrapage lundi 00:00–00:14 aussi accepté.
 *
 * Query: ?force=1 pour forcer hors fenêtre (manuel / test).
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";
  const now = new Date();
  const brussels = describeBrusselsNow(now);

  let target = weekToFreezeOpenSnapshot(now);
  if (!target && force) {
    // Force : figer la semaine ISO précédente (terminée)
    const { previousIsoWeek } = await import("@/lib/jira");
    target = {
      ...previousIsoWeek(now),
      reason: "force=1 — semaine ISO précédente",
    };
  }

  if (!target) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      brussels,
      inWindow: isOpenSnapshotWindow(now),
      message:
        "Hors fenêtre dimanche 23:50–23:59 (ou lundi 00:00–00:14) Europe/Brussels. Relancer avec ?force=1 pour un test.",
    });
  }

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

  const { year, week, reason } = target;
  const id = weekId({ year, month: 1, week });
  const jql = buildWeekJql(conn, year, week);

  try {
    // Compteur ouvert live (= stock à figer)
    const openCount = await countJql(conn, jql.open);

    // Optionnel : sync complète des autres KPI de la semaine qui se termine
    const full = searchParams.get("full") !== "0";
    let extras: Record<string, unknown> = {};
    if (full) {
      const stats = await fetchJiraWeekStats(year, week, conn);
      await ensureWeek(id);
      await updateWeeklyRow(id, {
        ...stats.patch,
        demandesNonResoluesHebdo: openCount,
        openFrozenAt: now.toISOString(),
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
    } else {
      await ensureWeek(id);
      await updateWeeklyRow(id, {
        demandesNonResoluesHebdo: openCount,
        openFrozenAt: now.toISOString(),
      });
    }

    const row = await getWeek(id);

    return NextResponse.json({
      ok: true,
      skipped: false,
      brussels,
      reason,
      weekId: id,
      openCount,
      openFrozenAt: row?.openFrozenAt ?? now.toISOString(),
      jqlOpen: jql.open,
      ...extras,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Snapshot échoué";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
