import { NextResponse } from "next/server";
import { FORMULAS, CATEGORY_LABELS } from "@/lib/formulas";
import { resetFromSeed } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ formulas: FORMULAS, categories: CATEGORY_LABELS });
}

/** Recharge la base depuis data/seed-from-excel.json (import KPI.xlsx) */
export async function POST() {
  const db = await resetFromSeed();
  return NextResponse.json({
    ok: true,
    weeks: db.weeks.length,
    automationsMetier: db.automationsMetier.length,
    automationsOdoo: db.automationsOdoo.length,
    phishing: db.phishing.length,
    maintenances: db.maintenances.length,
  });
}
