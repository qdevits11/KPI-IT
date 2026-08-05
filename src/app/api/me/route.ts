import { NextResponse } from "next/server";
import { resolveCurrentUser } from "@/lib/user-session";
import {
  canAccessAdminPages,
  canEditWeekRetour,
  isAdmin,
  isEncodingResponsible,
  isKpiResponsible,
} from "@/lib/roles";
import { clearUserSession } from "@/lib/user-session";
import { atlassianOAuthConfigured } from "@/lib/jira-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await resolveCurrentUser();
  return NextResponse.json({
    user,
    permissions: {
      adminPages: canAccessAdminPages(user),
      weekRetour: canEditWeekRetour(user),
      isAdmin: isAdmin(user),
      isKpiResponsible: isKpiResponsible(user),
      isEncodingResponsible: isEncodingResponsible(user),
    },
    oauthConfigured: atlassianOAuthConfigured(),
  });
}

export async function DELETE() {
  await clearUserSession();
  return NextResponse.json({ ok: true });
}
