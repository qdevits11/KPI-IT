import { NextResponse } from "next/server";
import {
  clearJiraConnection,
  DEFAULT_JIRA_SETTINGS,
  normalizeCustomFieldId,
  resolveJiraConnectionSource,
  sanitizeConnection,
  writeJiraConnection,
  type JiraConnection,
} from "@/lib/jira-auth";
import { testJiraConnection } from "@/lib/jira";
import { supabaseConfigured } from "@/lib/supabase-db";
import { atlassianOAuthConfigured } from "@/lib/jira-oauth";
import { canAccessAdminPages, isAdmin } from "@/lib/roles";
import { resolveAppUser, resolveCurrentUser } from "@/lib/user-session";
import { requireAdminApi } from "@/lib/access-api";

export async function GET() {
  const { connection, source } = await resolveJiraConnectionSource();
  const user = await resolveCurrentUser();
  return NextResponse.json({
    connected: Boolean(connection),
    source,
    authMode: connection?.authMode ?? null,
    supabaseConfigured: supabaseConfigured(),
    oauthConfigured: atlassianOAuthConfigured(),
    connection: connection ? sanitizeConnection(connection) : null,
    defaults: DEFAULT_JIRA_SETTINGS,
    user,
    canManageJira: canAccessAdminPages(user),
  });
}

/**
 * Configure le token de synchronisation partagé (email + API token).
 * N’écrit / n’efface jamais la session utilisateur.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<JiraConnection> & {
    action?: "connect" | "test" | "disconnect";
  };

  if (body.action === "disconnect") {
    const gate = await requireAdminApi();
    if ("response" in gate) return gate.response;
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

  const actor = await resolveCurrentUser();
  if (!actor || !canAccessAdminPages(actor)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Seul un administrateur peut enregistrer le token de synchronisation Jira.",
      },
      { status: 403 },
    );
  }

  const targetUser = await resolveAppUser(email);
  if (!isAdmin(targetUser)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Le token API de sync doit être celui d’un compte administrateur KPI·IT.",
      },
      { status: 403 },
    );
  }

  const conn: JiraConnection = {
    baseUrl,
    email,
    apiToken,
    authMode: "basic",
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
    categoryCustomFieldId: normalizeCustomFieldId(
      body.categoryCustomFieldId?.trim() ||
        DEFAULT_JIRA_SETTINGS.categoryCustomFieldId,
    ),
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
    source: supabaseConfigured() ? "supabase" : "cookie",
    connection: sanitizeConnection(conn),
  });
}

/** Déconnecte uniquement le compte de sync (pas la session utilisateur). */
export async function DELETE() {
  const gate = await requireAdminApi();
  if ("response" in gate) return gate.response;
  await clearJiraConnection();
  return NextResponse.json({ ok: true, connected: false });
}
