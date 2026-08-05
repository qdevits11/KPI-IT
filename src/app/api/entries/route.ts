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
import { isoWeekPartsFromDate, weekIdFromDate } from "@/lib/dates";
import { canonicalResponsible } from "@/lib/responsibles";
import { canEditWeekRetour } from "@/lib/roles";
import { resolveCurrentUser } from "@/lib/user-session";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("week") ?? currentWeekId();
  await ensureWeek(id);
  const db = await getDatabase();
  const week = db.weeks.find((w) => weekId(w) === id)!;
  const user = await resolveCurrentUser();
  return NextResponse.json({
    week,
    automationsMetier: db.automationsMetier,
    automationsOdoo: db.automationsOdoo,
    phishing: db.phishing,
    maintenances: db.maintenances,
    responsibles: db.settings.responsibles,
    permissions: {
      weekRetour: canEditWeekRetour(user),
    },
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
      date: string;
      year?: number;
      month?: number;
      week?: number;
      explanation?: string;
      responsible?: string;
      failures?: number;
    };
    collection?:
      | "automationsMetier"
      | "automationsOdoo"
      | "maintenances"
      | "phishing";
    eventId?: string;
  };

  let id = body.weekId ?? currentWeekId();

  if (body.action === "deleteEvent" && body.collection && body.eventId) {
    await deleteLogEvent(body.collection, body.eventId);
  } else if (
    (body.action === "addMetier" ||
      body.action === "addOdoo" ||
      body.action === "addMaintenance") &&
    body.event?.date &&
    body.event.explanation &&
    body.event.responsible
  ) {
    const dbCheck = await getDatabase();
    const canonical = canonicalResponsible(
      body.event.responsible,
      dbCheck.settings.responsibles,
    );
    if (!canonical) {
      return NextResponse.json(
        {
          error: `Responsable non autorisé. Choisissez parmi : ${dbCheck.settings.responsibles.join(", ")}`,
        },
        { status: 400 },
      );
    }
    const parts = isoWeekPartsFromDate(body.event.date);
    id = weekIdFromDate(body.event.date);
    await ensureWeek(id);
    const collection =
      body.action === "addMetier"
        ? "automationsMetier"
        : body.action === "addOdoo"
          ? "automationsOdoo"
          : "maintenances";
    try {
      await addLogEvent(collection, {
        date: body.event.date,
        explanation: body.event.explanation,
        responsible: canonical,
        ...parts,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } else if (body.action === "addPhishing" && body.event?.date) {
    const parts = isoWeekPartsFromDate(body.event.date);
    id = weekIdFromDate(body.event.date);
    await ensureWeek(id);
    await addPhishingEvent({
      date: body.event.date,
      failures: body.event.failures ?? 0,
      ...parts,
    });
  } else if (body.action === "updateWeek" && body.week) {
    const touchesRetour =
      body.week.informations !== undefined ||
      body.week.reaction !== undefined;
    if (touchesRetour) {
      const user = await resolveCurrentUser();
      if (!canEditWeekRetour(user)) {
        return NextResponse.json(
          {
            error:
              "Seul le responsable KPI peut enregistrer le retour sur la semaine.",
          },
          { status: 403 },
        );
      }
    }
    await updateWeeklyRow(id, body.week);
  } else if (body.week && !body.action) {
    // Compat : sync Jira / anciens clients
    await updateWeeklyRow(id, body.week);
  } else {
    return NextResponse.json(
      { error: "Requête invalide — champs manquants" },
      { status: 400 },
    );
  }

  const db = await getDatabase();
  const week = db.weeks.find((w) => weekId(w) === id) ?? (await ensureWeek(id));
  const dashboard = buildWeekDashboard(db, week);
  return NextResponse.json(dashboard);
}
