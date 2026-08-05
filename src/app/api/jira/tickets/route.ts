import { NextResponse } from "next/server";
import { resolveJiraConnection, sanitizeConnection } from "@/lib/jira-auth";
import {
  searchTickets,
  type TicketSearchFilter,
  type TicketSearchScope,
} from "@/lib/jira-tickets";

export const dynamic = "force-dynamic";

function parseScope(raw: string | null): TicketSearchScope | null {
  if (raw === "open" || raw === "created") return raw;
  return null;
}

/** Recherche de tickets individuels pour le drill-down des rapports. */
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
  const scope = parseScope(searchParams.get("scope"));
  if (!scope) {
    return NextResponse.json(
      { ok: false, error: "Paramètre scope requis (open | created)." },
      { status: 400 },
    );
  }

  const yearParam = searchParams.get("year");
  const year =
    yearParam && Number.isFinite(Number(yearParam))
      ? Number(yearParam)
      : undefined;
  const weekId = searchParams.get("week") ?? undefined;
  if (weekId && !/^\d{4}-S\d{2}$/.test(weekId)) {
    return NextResponse.json(
      { ok: false, error: "week invalide (ex. 2026-S32)." },
      { status: 400 },
    );
  }

  if (scope === "created" && !weekId && year == null) {
    return NextResponse.json(
      {
        ok: false,
        error: "Pour scope=created, indiquez week ou year.",
      },
      { status: 400 },
    );
  }

  const filter: TicketSearchFilter = {
    scope,
    assignee: searchParams.get("assignee") ?? undefined,
    requester: searchParams.get("requester") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    weekId,
    year,
  };

  try {
    const result = await searchTickets(filter, conn);
    return NextResponse.json({
      ok: true,
      configured: true,
      connection: sanitizeConnection(conn),
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        error: err instanceof Error ? err.message : "Erreur recherche tickets",
      },
      { status: 500 },
    );
  }
}
