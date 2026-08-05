import { NextResponse } from "next/server";
import { previousIsoWeek } from "@/lib/jira";
import { resolveJiraConnection } from "@/lib/jira-auth";
import { fetchJiraWeekStats, weekKey } from "@/lib/jira";
import { isoWeekDateRange } from "@/lib/jira";
import { sendWeekReport, smtpConfigured } from "@/lib/mail";
import {
  ensureWeek,
  updateWeeklyRow,
  setTicketsBreakdown,
} from "@/lib/store";
import { weekId } from "@/lib/types";

/**
 * Cron hebdo (ex. lundi matin) : sync semaine précédente + email SMTP.
 * Protégé par CRON_SECRET (header Authorization: Bearer …).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!smtpConfigured()) {
    return NextResponse.json(
      { ok: false, error: "SMTP non configuré" },
      { status: 400 },
    );
  }

  const conn = await resolveJiraConnection();
  if (!conn) {
    return NextResponse.json(
      { ok: false, error: "Jira non configuré (env ou cookie session)" },
      { status: 401 },
    );
  }

  const { year, week } = previousIsoWeek();
  const range = isoWeekDateRange(year, week);
  const id = weekId({ year, month: 1, week });

  try {
    const result = await fetchJiraWeekStats(year, week, conn);
    await ensureWeek(id);
    await updateWeeklyRow(id, result.patch);
    await setTicketsBreakdown(
      weekKey(year, week),
      result.byType,
      result.byAssignee,
    );

    const values = {
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

    const sent = await sendWeekReport(values);
    return NextResponse.json({
      ok: true,
      weekId: id,
      values,
      to: sent.to,
      messageId: sent.messageId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cron mail échoué";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
