import { NextResponse } from "next/server";
import { listPeriods, getPeriod, ensurePeriod, currentPeriodId } from "@/lib/store";
import { computeKpis } from "@/lib/formulas";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("period") ?? currentPeriodId();

  await ensurePeriod(periodId);
  const period = await getPeriod(periodId);
  if (!period) {
    return NextResponse.json({ error: "Période introuvable" }, { status: 404 });
  }

  const periods = await listPeriods();
  const kpis = computeKpis(period);

  return NextResponse.json({
    period,
    kpis,
    periods: periods.map((p) => p.period),
  });
}
