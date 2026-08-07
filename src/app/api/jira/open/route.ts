import { NextResponse } from "next/server";
import { resolveJiraConnection, sanitizeConnection } from "@/lib/jira-auth";
import {
  fetchOpenTicketsAsOf,
  fetchOpenTicketsSnapshot,
} from "@/lib/jira-tickets";
import { isoWeekDateRange } from "@/lib/jira";
import { parseWeekId } from "@/lib/types";
import { isIsoWeekCompleted } from "@/lib/open-snapshot";

export const dynamic = "force-dynamic";

/**
 * Snapshot des tickets ouverts.
 * - sans `week` → live (semaine en cours)
 * - avec `week=YYYY-Sww` (semaine terminée) → reconstitution historique fin de semaine
 */
export async function GET(request: Request) {
  const conn = await resolveJiraConnection();
  if (!conn) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Connectez d’abord votre compte Jira (page Sync Jira).",
        configured: false,
      },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const week = searchParams.get("week");

  try {
    if (week) {
      if (!/^\d{4}-S\d{2}$/.test(week)) {
        return NextResponse.json(
          { ok: false, error: "week invalide (ex. 2026-S32)." },
          { status: 400 },
        );
      }
      const { year, week: weekNum } = parseWeekId(week);
      if (!isIsoWeekCompleted(year, weekNum)) {
        // Semaine encore en cours : renvoyer le live
        const snapshot = await fetchOpenTicketsSnapshot(conn);
        return NextResponse.json({
          ok: true,
          configured: true,
          mode: "live",
          weekId: week,
          connection: sanitizeConnection(conn),
          ...snapshot,
        });
      }
      const { endInclusive } = isoWeekDateRange(year, weekNum);
      const snapshot = await fetchOpenTicketsAsOf(endInclusive, conn);
      return NextResponse.json({
        ok: true,
        configured: true,
        mode: "historical",
        weekId: week,
        asOfDate: endInclusive,
        connection: sanitizeConnection(conn),
        ...snapshot,
      });
    }

    const snapshot = await fetchOpenTicketsSnapshot(conn);
    return NextResponse.json({
      ok: true,
      configured: true,
      mode: "live",
      connection: sanitizeConnection(conn),
      ...snapshot,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        error: err instanceof Error ? err.message : "Erreur lecture tickets ouverts",
      },
      { status: 500 },
    );
  }
}
