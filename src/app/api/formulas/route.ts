import { NextResponse } from "next/server";
import { FORMULAS, CATEGORY_LABELS } from "@/lib/formulas";

export async function GET() {
  return NextResponse.json({ formulas: FORMULAS, categories: CATEGORY_LABELS });
}
