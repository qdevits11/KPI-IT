import { NextResponse } from "next/server";
import { resolveJiraConnection, sanitizeConnection } from "@/lib/jira-auth";
import { fetchClosedTicketsForWeek } from "@/lib/jira-tickets";
import { ensureWeek, updateWeeklyRow } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Snapshot des tickets clôturés pendant une semaine ISO, ventilés par assigné. */
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

  const week = new URL(request.url).searchParams.get("week");
  if (!week || !/^\d{4}-S\d{2}$/.test(week)) {
    return NextResponse.json(
      { ok: false, error: "Paramètre week requis (ex. 2026-S32)." },
      { status: 400 },
    );
  }

  try {
    const snapshot = await fetchClosedTicketsForWeek(week, conn);
    // Persiste le compteur pour la vue Analyse (colonne Clôturés).
    try {
      await ensureWeek(week);
      await updateWeeklyRow(week, {
        demandesClotureesHebdo: snapshot.total,
      });
    } catch {
      // persistance optionnelle — la liste reste utilisable
    }
    return NextResponse.json({
      ok: true,
      configured: true,
      weekId: week,
      connection: sanitizeConnection(conn),
      ...snapshot,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        error:
          err instanceof Error
            ? err.message
            : "Erreur lecture tickets clôturés",
      },
      { status: 500 },
    );
  }
}
