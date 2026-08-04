import { NextResponse } from "next/server";
import {
  clearJiraConnection,
  DEFAULT_JIRA_SETTINGS,
  readJiraConnection,
  resolveJiraConnection,
  sanitizeConnection,
  writeJiraConnection,
  type JiraConnection,
} from "@/lib/jira-auth";
import { testJiraConnection } from "@/lib/jira";

export async function GET() {
  const cookie = await readJiraConnection();
  const resolved = await resolveJiraConnection();
  return NextResponse.json({
    connected: Boolean(resolved),
    source: cookie ? "account" : resolved ? "env" : null,
    connection: resolved ? sanitizeConnection(resolved) : null,
    defaults: DEFAULT_JIRA_SETTINGS,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<JiraConnection> & {
    action?: "connect" | "test" | "disconnect";
  };

  if (body.action === "disconnect") {
    await clearJiraConnection();
    return NextResponse.json({ ok: true, connected: false });
  }

  const baseUrl = body.baseUrl?.trim().replace(/\/$/, "");
  const email = body.email?.trim();
  const apiToken = body.apiToken?.trim();

  if (!baseUrl || !email || !apiToken) {
    return NextResponse.json(
      { ok: false, error: "baseUrl, email et apiToken sont requis" },
      { status: 400 },
    );
  }

  if (!baseUrl.startsWith("https://")) {
    return NextResponse.json(
      { ok: false, error: "URL Jira invalide (https://xxx.atlassian.net)" },
      { status: 400 },
    );
  }

  const conn: JiraConnection = {
    baseUrl,
    email,
    apiToken,
    jqlBase: body.jqlBase?.trim() || DEFAULT_JIRA_SETTINGS.jqlBase,
    openStatusJql:
      body.openStatusJql?.trim() || DEFAULT_JIRA_SETTINGS.openStatusJql,
    datePriseEnChargeJql:
      body.datePriseEnChargeJql?.trim() ||
      DEFAULT_JIRA_SETTINGS.datePriseEnChargeJql,
    datePriseEnChargeFieldId:
      body.datePriseEnChargeFieldId?.trim() ||
      DEFAULT_JIRA_SETTINGS.datePriseEnChargeFieldId,
    slaPriseEnChargeHours:
      Number(body.slaPriseEnChargeHours) ||
      DEFAULT_JIRA_SETTINGS.slaPriseEnChargeHours,
    slaClotureHours:
      Number(body.slaClotureHours) || DEFAULT_JIRA_SETTINGS.slaClotureHours,
    categoryField: body.categoryField || DEFAULT_JIRA_SETTINGS.categoryField,
    connectedAt: new Date().toISOString(),
  };

  const test = await testJiraConnection(conn);
  if (!test.ok) {
    return NextResponse.json(
      { ok: false, error: test.error ?? "Connexion Jira échouée" },
      { status: 401 },
    );
  }

  if (body.action === "test") {
    return NextResponse.json({
      ok: true,
      tested: true,
      displayName: test.displayName,
      site: test.site,
    });
  }

  await writeJiraConnection(conn);
  return NextResponse.json({
    ok: true,
    connected: true,
    displayName: test.displayName,
    connection: sanitizeConnection(conn),
  });
}

export async function DELETE() {
  await clearJiraConnection();
  return NextResponse.json({ ok: true, connected: false });
}
