import { NextResponse } from "next/server";
import {
  fetchJiraCreatedBreakdown,
  mockCreatedBreakdown,
  weekKey,
} from "@/lib/jira";
import { resolveJiraConnection } from "@/lib/jira-auth";
import { ensureWeek, setTicketsByRequester } from "@/lib/store";

/**
 * Sync légère d’une semaine : uniquement les demandeurs (reporter).
 * Aucun KPI hebdo ni type/assigné n’est modifié.
 *
 * Body: { year, week, useMock?, dryRun? }
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    year?: number;
    week?: number;
    useMock?: boolean;
    dryRun?: boolean;
  };

  const year = Math.trunc(Number(body.year));
  const week = Math.trunc(Number(body.week));
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { ok: false, error: "Année invalide" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(week) || week < 1 || week > 53) {
    return NextResponse.json(
      { ok: false, error: "Semaine invalide (1–53)" },
      { status: 400 },
    );
  }

  const dryRun = Boolean(body.dryRun);
  const useMock = Boolean(body.useMock);
  const id = weekKey(year, week);

  try {
    if (useMock) {
      const result = mockCreatedBreakdown(year, week);
      if (!dryRun) {
        await ensureWeek(id);
        await setTicketsByRequester(id, result.byRequester);
      }
      return NextResponse.json({
        ok: true,
        mode: "mock",
        dryRun,
        weekId: id,
        year,
        week,
        createdCount: result.createdCount,
        requesterCount: Object.keys(result.byRequester).length,
        byRequester: result.byRequester,
        warnings: result.warnings,
        sampleCreatedKeys: result.sampleCreatedKeys,
      });
    }

    const conn = await resolveJiraConnection();
    if (!conn) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Connectez d’abord votre compte Jira (email + token API Atlassian).",
        },
        { status: 401 },
      );
    }

    const result = await fetchJiraCreatedBreakdown(year, week, conn);
    if (!dryRun) {
      await ensureWeek(id);
      await setTicketsByRequester(id, result.byRequester);
    }

    return NextResponse.json({
      ok: true,
      mode: "jira",
      dryRun,
      weekId: id,
      year,
      week,
      createdCount: result.createdCount,
      requesterCount: Object.keys(result.byRequester).length,
      byRequester: result.byRequester,
      warnings: result.warnings,
      sampleCreatedKeys: result.sampleCreatedKeys,
      jql: { created: result.jql.created, start: result.jql.start, endExclusive: result.jql.endExclusive },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Erreur sync demandeurs",
      },
      { status: 500 },
    );
  }
}
