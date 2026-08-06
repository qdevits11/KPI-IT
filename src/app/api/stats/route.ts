import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/store";
import {
  buildStatsOverview,
  buildTicketStats,
  STAT_DIMENSIONS,
} from "@/lib/stats";
import type { TicketStatDimension } from "@/lib/types";
import { requireSessionApi } from "@/lib/api";

const DIMENSIONS = new Set<TicketStatDimension>([
  "assignee",
  "requester",
  "type",
]);

export async function GET(request: Request) {
  const gate = await requireSessionApi();
  if ("response" in gate) return gate.response;

  const { searchParams } = new URL(request.url);
  const db = await getDatabase();
  const yearParam = searchParams.get("year");
  const year = yearParam ? Number(yearParam) : db.year;
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Année invalide" }, { status: 400 });
  }

  const years = [
    ...new Set([
      db.year,
      ...db.weeks.map((w) => w.year),
      ...Object.keys(db.ticketsByType ?? {}).map((k) => Number(k.slice(0, 4))),
    ]),
  ]
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => b - a);

  const dimension = searchParams.get("dimension") as TicketStatDimension | null;

  if (!dimension) {
    return NextResponse.json({
      year,
      years,
      overview: buildStatsOverview(db, year),
      dimensions: STAT_DIMENSIONS,
    });
  }

  if (!DIMENSIONS.has(dimension)) {
    return NextResponse.json(
      { error: "Dimension inconnue (assignee | requester | type)" },
      { status: 400 },
    );
  }

  const includeZeros = searchParams.get("zeros") === "1";
  const stats = buildTicketStats(db, year, dimension, {
    hideZeros: !includeZeros,
  });

  return NextResponse.json({
    year,
    years,
    stats,
    dimensions: STAT_DIMENSIONS,
  });
}
