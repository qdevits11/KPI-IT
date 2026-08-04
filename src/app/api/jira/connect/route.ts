import { NextResponse } from "next/server";
import {
  clearJiraConnection,
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

  if (!/^https:\/\/.+\.atlassian\.net$/i.test(baseUrl) && !baseUrl.startsWith("https://")) {
    return NextResponse.json(
      { ok: false, error: "URL Jira invalide (https://xxx.atlassian.net)" },
      { status: 400 },
    );
  }

  const conn: JiraConnection = {
    baseUrl,
    email,
    apiToken,
    jqlBase: body.jqlBase?.trim() || "project is not EMPTY",
    slaResolution: body.slaResolution?.trim() || "Time to resolution",
    slaFirstResponse:
      body.slaFirstResponse?.trim() || "Time to first response",
    categoryField: body.categoryField || "component",
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
