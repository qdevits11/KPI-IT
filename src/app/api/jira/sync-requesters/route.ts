import { NextResponse } from "next/server";
import {
  fetchJiraCreatedBreakdown,
  mockCreatedBreakdown,
  weekKey,
} from "@/lib/jira";
import { resolveJiraConnection } from "@/lib/jira-auth";
import {
  clearTicketsBreakdown,
  ensureWeek,
  patchTicketsBreakdown,
  type BreakdownPart,
} from "@/lib/store";

const ALL_PARTS: BreakdownPart[] = ["type", "assignee", "requester"];

function parseParts(raw: unknown): BreakdownPart[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return ["requester"];
  }
  const allowed = new Set<string>(ALL_PARTS);
  const parts = raw.filter(
    (p): p is BreakdownPart => typeof p === "string" && allowed.has(p),
  );
  return parts.length > 0 ? parts : ["requester"];
}

/**
 * Sync légère ventilations tickets créés (type / responsable / demandeur).
 *
 * Sync une semaine : { year, week, parts?, useMock?, dryRun? }
 * Sync plage : { year, weekFrom, weekTo, parts?, useMock?, dryRun? }
 * Clear : { action: "clear", year?, weekFrom?, weekTo?, parts? }
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    year?: number;
    week?: number;
    weekFrom?: number;
    weekTo?: number;
    parts?: string[];
    useMock?: boolean;
    dryRun?: boolean;
  };

  const parts = parseParts(body.parts);

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
      const result = await clearTicketsBreakdown({
        year,
        weekFrom,
        weekTo,
        parts,
      });
      return NextResponse.json({
        ok: true,
        mode: "clear",
        parts,
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
            err instanceof Error
              ? err.message
              : "Erreur effacement ventilations",
        },
        { status: 500 },
      );
    }
  }

  const year = Math.trunc(Number(body.year));
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { ok: false, error: "Année invalide" },
      { status: 400 },
    );
  }

  const dryRun = Boolean(body.dryRun);
  const useMock = Boolean(body.useMock);

  const weeks: number[] = [];
  if (body.weekFrom != null || body.weekTo != null) {
    const from = Math.trunc(Number(body.weekFrom ?? body.weekTo));
    const to = Math.trunc(Number(body.weekTo ?? body.weekFrom));
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from < 1 ||
      to < 1 ||
      from > 53 ||
      to > 53
    ) {
      return NextResponse.json(
        { ok: false, error: "Plage de semaines invalide (1–53)" },
        { status: 400 },
      );
    }
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let w = lo; w <= hi; w++) weeks.push(w);
  } else {
    const w = Math.trunc(Number(body.week));
    if (!Number.isFinite(w) || w < 1 || w > 53) {
      return NextResponse.json(
        { ok: false, error: "Semaine invalide (1–53)" },
        { status: 400 },
      );
    }
    weeks.push(w);
  }

  if (!useMock) {
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
  }

  const results: Array<{
    weekId: string;
    week: number;
    ok: boolean;
    createdCount: number;
    assigneeCount: number;
    requesterCount: number;
    typeCount: number;
    sampleAssignees: string[];
    sampleRequesters: string[];
    warnings: string[];
    error?: string;
  }> = [];

  try {
    for (const week of weeks) {
      const id = weekKey(year, week);
      try {
        const result = useMock
          ? mockCreatedBreakdown(year, week)
          : await fetchJiraCreatedBreakdown(year, week);

        if (!dryRun) {
          await ensureWeek(id);
          const patch: {
            byType?: Record<string, number>;
            byAssignee?: Record<string, number>;
            byRequester?: Record<string, number>;
          } = {};
          if (parts.includes("type")) patch.byType = result.byType;
          if (parts.includes("assignee")) patch.byAssignee = result.byAssignee;
          if (parts.includes("requester")) {
            patch.byRequester = result.byRequester;
          }
          await patchTicketsBreakdown(id, patch);
        }

        results.push({
          weekId: id,
          week,
          ok: true,
          createdCount: result.createdCount,
          assigneeCount: Object.keys(result.byAssignee).length,
          requesterCount: Object.keys(result.byRequester).length,
          typeCount: Object.keys(result.byType).length,
          sampleAssignees: Object.keys(result.byAssignee).slice(0, 5),
          sampleRequesters: Object.keys(result.byRequester).slice(0, 5),
          warnings: result.warnings,
        });
      } catch (err) {
        results.push({
          weekId: id,
          week,
          ok: false,
          createdCount: 0,
          assigneeCount: 0,
          requesterCount: 0,
          typeCount: 0,
          sampleAssignees: [],
          sampleRequesters: [],
          warnings: [],
          error: err instanceof Error ? err.message : "Erreur semaine",
        });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    const last = results[results.length - 1];

    return NextResponse.json({
      ok: failCount === 0,
      mode: useMock ? "mock" : "jira",
      dryRun,
      parts,
      year,
      weekFrom: weeks[0],
      weekTo: weeks[weeks.length - 1],
      okCount,
      failCount,
      results,
      weekId: last?.weekId,
      week: last?.week,
      createdCount: last?.createdCount ?? 0,
      requesterCount: last?.requesterCount ?? 0,
      warnings: results.flatMap((r) => r.warnings).slice(0, 30),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Erreur sync ventilations",
      },
      { status: 500 },
    );
  }
}
