import { NextResponse } from "next/server";
import {
  getDatabase,
  ensureWeek,
  currentWeekId,
  listWeeks,
} from "@/lib/store";
import { buildWeekDashboard } from "@/lib/formulas";
import { weekId } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("week") ?? currentWeekId();

  await ensureWeek(id);
  const db = await getDatabase();
  const week = db.weeks.find((w) => weekId(w) === id);
  if (!week) {
    return NextResponse.json({ error: "Semaine introuvable" }, { status: 404 });
  }

  const dashboard = buildWeekDashboard(db, week);
  const weeks = (await listWeeks()).map((w) => ({
    id: weekId(w),
    label: `S${String(w.week).padStart(2, "0")} — ${w.year} (mois ${w.month})`,
    year: w.year,
    week: w.week,
    month: w.month,
  }));

  return NextResponse.json({ ...dashboard, weeks });
}
