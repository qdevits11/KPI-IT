import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/roles";
import { getAccessRightsForEmail } from "@/lib/store";
import { writeUserSession } from "@/lib/user-session";
import { atlassianOAuthConfigured } from "@/lib/jira-oauth";

export const dynamic = "force-dynamic";

/**
 * Connexion de secours par email (si OAuth non configuré).
 * L’email doit déjà figurer dans les droits d’accès.
 */
export async function POST(request: Request) {
  if (atlassianOAuthConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Utilisez la connexion Microsoft / Atlassian (OAuth est configuré).",
      },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    displayName?: string;
  };
  const email = normalizeEmail(body.email ?? "");
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "Email invalide" },
      { status: 400 },
    );
  }

  const rights = await getAccessRightsForEmail(email);
  if (!rights.isAdmin && !rights.isKpiResponsible) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Cet email n’a pas de droits KPI·IT. Demandez à un administrateur de l’ajouter dans Configuration.",
      },
      { status: 403 },
    );
  }

  await writeUserSession({
    email,
    displayName: body.displayName?.trim() || undefined,
    authMode: "basic",
    connectedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    email,
    rights,
  });
}
