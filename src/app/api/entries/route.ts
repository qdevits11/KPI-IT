import { NextResponse } from "next/server";
import {
  updateWeeklyRow,
  ensureWeek,
  currentWeekId,
  addLogEvent,
  addPhishingEvent,
  deleteLogEvent,
  getDatabase,
} from "@/lib/store";
import { buildWeekDashboard } from "@/lib/formulas";
import { weekId } from "@/lib/types";
import type { WeeklyRow } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("week") ?? currentWeekId();
  await ensureWeek(id);
  const db = await getDatabase();
  const week = db.weeks.find((w) => weekId(w) === id)!;
  return NextResponse.json({
    week,
    automationsMetier: db.automationsMetier,
    automationsOdoo: db.automationsOdoo,
    phishing: db.phishing,
    maintenances: db.maintenances,
  });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    weekId?: string;
    week?: Partial<WeeklyRow>;
    action?:
      | "updateWeek"
      | "addMetier"
      | "addOdoo"
      | "addPhishing"
      | "addMaintenance"
      | "deleteEvent";
    event?: {
      year: number;
      month: number;
      week: number;
      explanation: string;
      responsible: string;
      failures?: number;
    };
    collection?: "automationsMetier" | "automationsOdoo" | "maintenances" | "phishing";
    eventId?: string;
  };

  const id = body.weekId ?? currentWeekId();

  if (body.action === "deleteEvent" && body.collection && body.eventId) {
    await deleteLogEvent(body.collection, body.eventId);
  } else if (body.action === "addMetier" && body.event) {
    await addLogEvent("automationsMetier", body.event);
  } else if (body.action === "addOdoo" && body.event) {
    await addLogEvent("automationsOdoo", body.event);
  } else if (body.action === "addMaintenance" && body.event) {
    await addLogEvent("maintenances", body.event);
  } else if (body.action === "addPhishing" && body.event) {
    await addPhishingEvent({
      ...body.event,
      failures: body.event.failures ?? 0,
    });
  } else if (body.week) {
    await updateWeeklyRow(id, body.week);
  }

  const db = await getDatabase();
  const week = db.weeks.find((w) => weekId(w) === id) ?? (await ensureWeek(id));
  const dashboard = buildWeekDashboard(db, week);
  return NextResponse.json(dashboard);
}
