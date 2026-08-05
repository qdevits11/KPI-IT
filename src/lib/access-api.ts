import { NextResponse } from "next/server";
import { canAccessAdminPages } from "@/lib/roles";
import { resolveCurrentUser } from "@/lib/user-session";
import type { AppUser } from "@/lib/roles";

/** 403 si l’utilisateur n’est pas admin. */
export async function requireAdminApi(): Promise<
  { user: AppUser } | { response: NextResponse }
> {
  const user = await resolveCurrentUser();
  if (!canAccessAdminPages(user)) {
    return {
      response: NextResponse.json(
        {
          ok: false,
          error:
            "Accès réservé aux administrateurs KPI·IT.",
        },
        { status: 403 },
      ),
    };
  }
  return { user: user! };
}
