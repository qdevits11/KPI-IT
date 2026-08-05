import { NextResponse } from "next/server";
import {
  fetchJiraCreatedBreakdown,
  mockCreatedBreakdown,
  weekKey,
} from "@/lib/jira";
import { resolveJiraConnection } from "@/lib/jira-auth";
import {
  clearTicketsByRequester,
  ensureWeek,
  setTicketsByRequester,
} from "@/lib/store";

/**
 * Sync légère d’une semaine : uniquement les demandeurs (reporter).
 * Ou action « clear » pour effacer les demandeurs (démo / plage).
 *
 * Body sync : { year, week, useMock?, dryRun? }
 * Body clear : { action: "clear", year?, weekFrom?, weekTo? }
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    year?: number;
    week?: number;
    weekFrom?: number;
    weekTo?: number;
    useMock?: boolean;
    dryRun?: boolean;
  };

  if (body.action === "clear") {
    const year =
      body.year != null && Number.isFinite(Number(body.year))
        ? Math.trunc(Number(body.year))
        : undefined;
    const weekFrom =
      body.weekFrom != null && Number.isFinite(Number(body.weekFrom))
        ? Math.trunc(Number(body.weekFrom))
        : undefined;
    const weekTo =
      body.weekTo != null && Number.isFinite(Number(body.weekTo))
        ? Math.trunc(Number(body.weekTo))
        : undefined;

    if (year != null && (year < 2000 || year > 2100)) {
      return NextResponse.json(
        { ok: false, error: "Année invalide" },
        { status: 400 },
      );
    }

    try {
      const result = await clearTicketsByRequester({ year, weekFrom, weekTo });
      return NextResponse.json({
        ok: true,
        mode: "clear",
        year: year ?? null,
        weekFrom: weekFrom ?? null,
        weekTo: weekTo ?? null,
        ...result,
      });
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error:
            err instanceof Error ? err.message : "Erreur effacement demandeurs",
        },
        { status: 500 },
      );
    }
  }

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
      jql: {
        created: result.jql.created,
        start: result.jql.start,
        endExclusive: result.jql.endExclusive,
      },
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
