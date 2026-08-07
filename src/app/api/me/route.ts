import { NextResponse } from "next/server";
import {
  clearUserSession,
  readUserSession,
  resolveCurrentUser,
} from "@/lib/user-session";
import {
  canAccessAdminPages,
  canEditWeekRetour,
  isAdmin,
  isEncodingResponsible,
  isKpiResponsible,
} from "@/lib/roles";
import {
  atlassianOAuthConfigured,
  clearUserOAuthTokens,
} from "@/lib/jira-oauth";

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
  const session = await readUserSession();
  if (session?.email) {
    try {
      await clearUserOAuthTokens(session.email);
    } catch {
      // ignore
    }
  }
  await clearUserSession();
  return NextResponse.json({ ok: true });
}
