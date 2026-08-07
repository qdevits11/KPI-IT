import { NextResponse } from "next/server";
import {
  getDatabase,
  ensureWeek,
  currentWeekId,
} from "@/lib/store";
import { buildWeekDashboard } from "@/lib/formulas";
import { weekId, parseWeekId } from "@/lib/types";
import {
  isIsoWeekCompleted,
  describeBrusselsNow,
  ensureWeeklyOpenFreezeInApp,
} from "@/lib/open-snapshot";
import { isoWeekDateRange } from "@/lib/jira";
import { clampWeekIdToCurrent, formatWeekRangeLabel } from "@/lib/dates";
import { requireSessionApi } from "@/lib/api";

export async function GET(request: Request) {
  const gate = await requireSessionApi();
  if ("response" in gate) return gate.response;

  // Figement fin de semaine dans l’app (pas de cron HTTP externe).
  await ensureWeeklyOpenFreezeInApp();

  const { searchParams } = new URL(request.url);
  const currentId = currentWeekId();
  const id = clampWeekIdToCurrent(searchParams.get("week"), new Date());

  await ensureWeek(id);
  const db = await getDatabase();
  const week = db.weeks.find((w) => weekId(w) === id);
  if (!week) {
    return NextResponse.json({ error: "Semaine introuvable" }, { status: 404 });
  }

  const dashboard = buildWeekDashboard(db, week);
  const { year, week: weekNum } = parseWeekId(id);
  const completed = isIsoWeekCompleted(year, weekNum);
  const isCurrentWeek = id === currentId;
  const isLive = isCurrentWeek && !week.openFrozenAt && !completed;
  const range = isoWeekDateRange(year, weekNum);

  const weeks = [...db.weeks]
    .filter((w) => weekId(w) <= currentId)
    .sort((a, b) =>
      a.year === b.year ? b.week - a.week : b.year - a.year,
    )
    .map((w) => {
      const wid = weekId(w);
      return {
        id: wid,
        label: `S${String(w.week).padStart(2, "0")} — ${w.year} (mois ${w.month})${
          wid === currentId ? " · en cours" : ""
        }`,
        year: w.year,
        week: w.week,
        month: w.month,
        isCurrent: wid === currentId,
      };
    });

  return NextResponse.json({
    ...dashboard,
    weeks,
    meta: {
      currentWeekId: currentId,
      isCurrentWeek,
      isCompleted: completed,
      isLive,
      openFrozenAt: week.openFrozenAt,
      jiraSyncedAt: week.jiraSyncedAt,
      dateRange: range,
      dateRangeLabel: formatWeekRangeLabel(year, weekNum),
      brusselsNow: describeBrusselsNow(),
    },
  });
}
