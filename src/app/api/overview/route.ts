import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/store";
import { buildYearOverview } from "@/lib/formulas";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const db = await getDatabase();
  const year = Number(searchParams.get("year") ?? db.year);

  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "Année invalide" }, { status: 400 });
  }

  const rows = buildYearOverview(db, year);
  const years = [...new Set(db.weeks.map((w) => w.year))].sort(
    (a, b) => b - a,
  );

  return NextResponse.json({
    year,
    years: years.length > 0 ? years : [db.year],
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
