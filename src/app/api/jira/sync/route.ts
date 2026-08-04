import { NextResponse } from "next/server";
import {
  fetchJiraWeekStats,
  mockJiraWeekStats,
  weekKey,
  buildWeekJql,
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get("week");
  const conn = await resolveJiraConnection();

  let previewJql = null;
  if (conn && weekParam) {
    const { year, week } = parseWeekId(weekParam);
    previewJql = buildWeekJql(conn, year, week);
  }

  return NextResponse.json({
    configured: Boolean(conn),
    connection: conn ? sanitizeConnection(conn) : null,
    previewJql,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    weekId?: string;
    useMock?: boolean;
  };
  const id = body.weekId ?? currentWeekId();
  await ensureWeek(id);
  const { year, week } = parseWeekId(id);
  const conn = await resolveJiraConnection();

  try {
    if (body.useMock) {
      const result = mockJiraWeekStats(year, week);
      await updateWeeklyRow(id, result.patch);
      await setTicketsBreakdown(
        weekKey(year, week),
        result.byType,
        result.byAssignee,
      );
      const db = await getDatabase();
      const row = db.weeks.find((w) => weekId(w) === id)!;
      return NextResponse.json({
        ok: true,
        mode: "mock",
        dashboard: buildWeekDashboard(db, row),
        jql: result.jql,
        warnings: result.warnings,
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
    await updateWeeklyRow(id, result.patch);
    await setTicketsBreakdown(
      weekKey(year, week),
      result.byType,
      result.byAssignee,
    );

    const db = await getDatabase();
    const row = db.weeks.find((w) => weekId(w) === id)!;

    return NextResponse.json({
      ok: true,
      mode: "jira",
      dashboard: buildWeekDashboard(db, row),
      jql: result.jql,
      warnings: result.warnings,
      probe: result.probe,
      diagnostics: result.diagnostics,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur Jira";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
