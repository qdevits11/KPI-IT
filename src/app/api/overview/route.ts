import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/store";
import { buildYearOverview } from "@/lib/formulas";
import { requireSessionApi } from "@/lib/api";
import { parseWeekRangeParam } from "@/lib/week-range";

export async function GET(request: Request) {
  const gate = await requireSessionApi();
  if ("response" in gate) return gate.response;

  const { searchParams } = new URL(request.url);
  const db = await getDatabase();
  const year = Number(searchParams.get("year") ?? db.year);

  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "Année invalide" }, { status: 400 });
  }

  const range = parseWeekRangeParam(
    searchParams.get("weekFrom"),
    searchParams.get("weekTo"),
  );

  const rows = buildYearOverview(db, year, range);
  const years = [...new Set(db.weeks.map((w) => w.year))].sort(
    (a, b) => b - a,
  );

  return NextResponse.json({
    year,
    years: years.length > 0 ? years : [db.year],
    weekFrom: range.weekFrom ?? null,
    weekTo: range.weekTo ?? null,
    rows,
    totals: {
      automationsMetier: rows.reduce((s, r) => s + r.automationsMetier, 0),
      ameliorationsOdoo: rows.reduce((s, r) => s + r.ameliorationsOdoo, 0),
      echecsPhishing: rows.reduce((s, r) => s + r.echecsPhishing, 0),
      maintenances: rows.reduce((s, r) => s + r.maintenances, 0),
      demandesItHebdo: rows.reduce((s, r) => s + (r.demandesItHebdo ?? 0), 0),
    },
  });
}
