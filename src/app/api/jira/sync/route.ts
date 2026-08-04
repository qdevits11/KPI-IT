import { NextResponse } from "next/server";
import {
  fetchJiraStatsForPeriod,
  getJiraConfig,
  mockJiraStats,
} from "@/lib/jira";
import { updateJiraStats, currentPeriodId } from "@/lib/store";
import { computeKpis } from "@/lib/formulas";

export async function GET() {
  const configured = Boolean(getJiraConfig());
  return NextResponse.json({
    configured,
    env: {
      hasBaseUrl: Boolean(process.env.JIRA_BASE_URL),
      hasEmail: Boolean(process.env.JIRA_EMAIL),
      hasToken: Boolean(process.env.JIRA_API_TOKEN),
      jqlBase: process.env.JIRA_JQL_BASE ?? "project is not EMPTY",
      slaHours: process.env.JIRA_SLA_HOURS ?? "8",
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    periodId?: string;
    useMock?: boolean;
  };

  const periodId = body.periodId ?? currentPeriodId();
  const configured = Boolean(getJiraConfig());

  try {
    let stats;
    if (!configured || body.useMock) {
      stats = mockJiraStats(periodId);
    } else {
      stats = await fetchJiraStatsForPeriod(periodId);
    }

    const period = await updateJiraStats(periodId, stats);
    const kpis = computeKpis(period);

    return NextResponse.json({
      ok: true,
      mode: !configured || body.useMock ? "mock" : "jira",
      period,
      kpis,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur Jira";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
