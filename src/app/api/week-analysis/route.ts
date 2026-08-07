import { z } from "zod";
import { apiOk, parseJsonBody, requireKpiRetourApi } from "@/lib/api";
import { currentWeekId, ensureWeek, getDatabase } from "@/lib/store";
import { generateWeekAnalysis } from "@/lib/week-analysis";

const bodySchema = z.object({
  weekId: z.string().min(1).optional(),
});

/**
 * Génère un brouillon de retour de semaine (fluctuation + recommandations).
 * Réservé au responsable KPI — ne persiste pas (validation humaine ensuite).
 */
export async function POST(request: Request) {
  const gate = await requireKpiRetourApi();
  if ("response" in gate) return gate.response;

  const raw = await request.json().catch(() => null);
  const parsed = parseJsonBody(bodySchema, raw ?? {});
  if ("response" in parsed) return parsed.response;

  const weekId = parsed.data.weekId ?? currentWeekId();
  await ensureWeek(weekId);
  const db = await getDatabase();
  const analysis = generateWeekAnalysis(db, weekId);

  return apiOk({
    weekId: analysis.weekId,
    fluctuation: analysis.fluctuation,
    recommandations: analysis.recommandations,
    signalCount: analysis.signals.length,
  });
}
