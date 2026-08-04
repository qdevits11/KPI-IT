import { NextResponse } from "next/server";
import {
  fetchJiraWeekStats,
  getJiraConfig,
  mockJiraWeekStats,
  weekKey,
} from "@/lib/jira";
import {
  updateWeeklyRow,
  setTicketsBreakdown,
  currentWeekId,
  ensureWeek,
} from "@/lib/store";
import { buildWeekDashboard } from "@/lib/formulas";
import { getDatabase } from "@/lib/store";
import { weekId, parseWeekId } from "@/lib/types";

export async function GET() {
  return NextResponse.json({
    configured: Boolean(getJiraConfig()),
    env: {
      hasBaseUrl: Boolean(process.env.JIRA_BASE_URL),
      hasEmail: Boolean(process.env.JIRA_EMAIL),
      hasToken: Boolean(process.env.JIRA_API_TOKEN),
      jqlBase: process.env.JIRA_JQL_BASE ?? "project is not EMPTY",
    },
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
  const configured = Boolean(getJiraConfig());

  try {
    const result =
      !configured || body.useMock
        ? mockJiraWeekStats(year, week)
        : await fetchJiraWeekStats(year, week);

    await updateWeeklyRow(id, result.patch);
    await setTicketsBreakdown(weekKey(year, week), result.byType, result.byAssignee);

    const db = await getDatabase();
    const row = db.weeks.find((w) => weekId(w) === id)!;
    const dashboard = buildWeekDashboard(db, row);

    return NextResponse.json({
      ok: true,
      mode: !configured || body.useMock ? "mock" : "jira",
      dashboard,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur Jira";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
