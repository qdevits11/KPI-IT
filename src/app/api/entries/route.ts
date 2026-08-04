import { NextResponse } from "next/server";
import { updateManualEntries, ensurePeriod, currentPeriodId } from "@/lib/store";
import type { ManualEntries } from "@/lib/types";
import { computeKpis } from "@/lib/formulas";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("period") ?? currentPeriodId();
  const period = await ensurePeriod(periodId);
  return NextResponse.json({ period, manual: period.manual });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    periodId?: string;
    manual: ManualEntries;
    updatedBy?: string;
  };

  const periodId = body.periodId ?? currentPeriodId();
  if (!body.manual) {
    return NextResponse.json({ error: "manual requis" }, { status: 400 });
  }

  const period = await updateManualEntries(
    periodId,
    body.manual,
    body.updatedBy,
  );
  const kpis = computeKpis(period);

  return NextResponse.json({ period, kpis });
}
