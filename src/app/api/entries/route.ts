import {
  updateWeeklyRow,
  ensureWeek,
  currentWeekId,
  addLogEvent,
  addPhishingEvent,
  deleteLogEvent,
  getDatabase,
  getResponsibles,
} from "@/lib/store";
import { buildWeekDashboard } from "@/lib/formulas";
import { weekId } from "@/lib/types";
import type { WeeklyRow } from "@/lib/types";
import { isoWeekPartsFromDate, weekIdFromDate } from "@/lib/dates";
import { canonicalResponsible } from "@/lib/responsibles";
import { canEditWeekRetour } from "@/lib/roles";
import {
  apiError,
  apiOk,
  parseJsonBody,
  requireEncodingApi,
  requireKpiRetourApi,
  requireSessionApi,
} from "@/lib/api";
import { z } from "zod";

const entriesPutSchema = z.object({
  weekId: z.string().optional(),
  week: z.record(z.string(), z.unknown()).optional(),
  action: z
    .enum([
      "updateWeek",
      "addMetier",
      "addOdoo",
      "addPhishing",
      "addMaintenance",
      "deleteEvent",
    ])
    .optional(),
  event: z
    .object({
      date: z.string().min(1),
      year: z.number().optional(),
      month: z.number().optional(),
      week: z.number().optional(),
      explanation: z.string().optional(),
      responsible: z.string().optional(),
      failures: z.number().optional(),
    })
    .optional(),
  collection: z
    .enum([
      "automationsMetier",
      "automationsOdoo",
      "maintenances",
      "phishing",
    ])
    .optional(),
  eventId: z.string().optional(),
});

export async function GET(request: Request) {
  const gate = await requireSessionApi();
  if ("response" in gate) return gate.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("week") ?? currentWeekId();
  await ensureWeek(id);
  const db = await getDatabase();
  const week = db.weeks.find((w) => weekId(w) === id)!;
  return apiOk({
    week,
    automationsMetier: db.automationsMetier,
    automationsOdoo: db.automationsOdoo,
    phishing: db.phishing,
    maintenances: db.maintenances,
    responsibles: db.settings.responsibles,
    permissions: {
      weekRetour: canEditWeekRetour(gate.user),
    },
  });
}

export async function PUT(request: Request) {
  const raw = await request.json().catch(() => null);
  const parsed = parseJsonBody(entriesPutSchema, raw);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  let id = body.weekId ?? currentWeekId();

  if (body.action === "deleteEvent" && body.collection && body.eventId) {
    const gate = await requireEncodingApi();
    if ("response" in gate) return gate.response;
    await deleteLogEvent(body.collection, body.eventId);
  } else if (
    (body.action === "addMetier" ||
      body.action === "addOdoo" ||
      body.action === "addMaintenance") &&
    body.event?.date &&
    body.event.explanation &&
    body.event.responsible
  ) {
    const gate = await requireEncodingApi();
    if ("response" in gate) return gate.response;

    const responsibles = await getResponsibles();
    const canonical = canonicalResponsible(
      body.event.responsible,
      responsibles,
    );
    if (!canonical) {
      return apiError(
        `Responsable non autorisé. Choisissez parmi : ${responsibles.join(", ")}`,
        400,
        "validation",
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
      return apiError(message, 400, "validation");
    }
  } else if (body.action === "addPhishing" && body.event?.date) {
    const gate = await requireEncodingApi();
    if ("response" in gate) return gate.response;
    const parts = isoWeekPartsFromDate(body.event.date);
    id = weekIdFromDate(body.event.date);
    await ensureWeek(id);
    await addPhishingEvent({
      date: body.event.date,
      failures: body.event.failures ?? 0,
      ...parts,
    });
  } else if (body.action === "updateWeek" && body.week) {
    const weekPatch = body.week as Partial<WeeklyRow>;
    const touchesRetour =
      weekPatch.informations !== undefined ||
      weekPatch.reaction !== undefined;
    if (touchesRetour) {
      const gate = await requireKpiRetourApi();
      if ("response" in gate) return gate.response;
    } else {
      const gate = await requireSessionApi();
      if ("response" in gate) return gate.response;
    }
    await updateWeeklyRow(id, weekPatch);
  } else if (body.week && !body.action) {
    // Compat sync interne : réservé session (plus d’écriture anonyme)
    const gate = await requireSessionApi();
    if ("response" in gate) return gate.response;
    await updateWeeklyRow(id, body.week as Partial<WeeklyRow>);
  } else {
    return apiError("Requête invalide — champs manquants", 400, "validation");
  }

  const db = await getDatabase();
  const week = db.weeks.find((w) => weekId(w) === id) ?? (await ensureWeek(id));
  const dashboard = buildWeekDashboard(db, week);
  return apiOk({ ...dashboard });
}
