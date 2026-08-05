import { NextResponse } from "next/server";
import {
  fetchJiraWeekStats,
  mockJiraWeekStats,
  isoWeekDateRange,
  previousIsoWeek,
} from "@/lib/jira";
import { resolveJiraConnection } from "@/lib/jira-auth";
import {
  getSmtpConfig,
  sendWeekReport,
  smtpConfigured,
  verifySmtp,
  type WeekMailValues,
} from "@/lib/mail";
import {
  ensureWeek,
  updateWeeklyRow,
  setTicketsBreakdown,
  getDatabase,
} from "@/lib/store";
import { weekKey } from "@/lib/jira";
import { weekId } from "@/lib/types";

function resolveWeek(body: {
  year?: number;
  week?: number;
  usePreviousWeek?: boolean;
}): { year: number; week: number } | { error: string } {
  if (body.usePreviousWeek) {
    return previousIsoWeek();
  }
  if (
    typeof body.year === "number" &&
    typeof body.week === "number" &&
    Number.isFinite(body.year) &&
    Number.isFinite(body.week)
  ) {
    const year = Math.trunc(body.year);
    const week = Math.trunc(body.week);
    if (year < 2000 || year > 2100) {
      return { error: "Année invalide (2000–2100)." };
    }
    if (week < 1 || week > 53) {
      return { error: "Numéro de semaine invalide (1–53)." };
    }
    return { year, week };
  }
  return { error: "Indiquez year + week, ou usePreviousWeek: true." };
}

export async function GET() {
  const cfg = getSmtpConfig();
  return NextResponse.json({
    configured: smtpConfigured(),
    host: cfg?.host ?? null,
    from: cfg?.from ?? null,
    to: cfg?.to ?? [],
    port: cfg?.port ?? null,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    year?: number;
    week?: number;
    usePreviousWeek?: boolean;
    /** Sync Jira avant envoi (défaut true) */
    syncFirst?: boolean;
    useMock?: boolean;
    /** Enregistre aussi les KPI en base (défaut true si syncFirst) */
    save?: boolean;
    to?: string | string[];
    /** Vérifie seulement la connexion SMTP */
    verifyOnly?: boolean;
  };

  if (body.verifyOnly) {
    const result = await verifySmtp();
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (!smtpConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "SMTP non configuré. Sur Vercel : SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_TO.",
      },
      { status: 400 },
    );
  }

  const target = resolveWeek(body);
  if ("error" in target) {
    return NextResponse.json({ ok: false, error: target.error }, { status: 400 });
  }

  const { year, week } = target;
  const range = isoWeekDateRange(year, week);
  const syncFirst = body.syncFirst !== false;
  const save = body.save !== false;
  const id = weekId({ year, month: 1, week });

  try {
    let values: WeekMailValues;

    if (syncFirst) {
      const conn = await resolveJiraConnection();
      if (!conn && !body.useMock) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Compte Jira non connecté. Connectez-vous ou passez useMock: true.",
          },
          { status: 401 },
        );
      }

      const result = body.useMock
        ? mockJiraWeekStats(year, week)
        : await fetchJiraWeekStats(year, week, conn);

      if (save) {
        await ensureWeek(id);
        await updateWeeklyRow(id, result.patch);
        await setTicketsBreakdown(
          weekKey(year, week),
          result.byType,
          result.byAssignee,
        );
      }

      values = {
        year,
        week,
        start: range.start,
        endExclusive: range.endExclusive,
        demandesItHebdo: result.patch.demandesItHebdo ?? 0,
        demandesNonResoluesHebdo: result.patch.demandesNonResoluesHebdo ?? 0,
        ticketsHorsSlaCloture: result.patch.ticketsHorsSlaCloture ?? 0,
        ticketsHorsSlaPriseEnCharge:
          result.patch.ticketsHorsSlaPriseEnCharge ?? 0,
      };
    } else {
      await ensureWeek(id);
      const db = await getDatabase();
      const row = db.weeks.find((w) => weekId(w) === id);
      if (!row) {
        return NextResponse.json(
          { ok: false, error: `Semaine ${id} introuvable en base.` },
          { status: 404 },
        );
      }
      values = {
        year,
        week,
        start: range.start,
        endExclusive: range.endExclusive,
        demandesItHebdo: row.demandesItHebdo ?? 0,
        demandesNonResoluesHebdo: row.demandesNonResoluesHebdo ?? 0,
        ticketsHorsSlaCloture: row.ticketsHorsSlaCloture ?? 0,
        ticketsHorsSlaPriseEnCharge: row.ticketsHorsSlaPriseEnCharge ?? 0,
      };
    }

    const toOverride = Array.isArray(body.to)
      ? body.to
      : typeof body.to === "string" && body.to.trim()
        ? body.to
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

    const sent = await sendWeekReport(values, { to: toOverride });

    return NextResponse.json({
      ok: true,
      weekId: id,
      values,
      to: sent.to,
      messageId: sent.messageId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Envoi email échoué";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
