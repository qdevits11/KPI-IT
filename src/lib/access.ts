import { redirect } from "next/navigation";
import {
  canAccessAdminPages,
  canEditWeekRetour,
  type AppUser,
} from "@/lib/roles";
import { resolveCurrentUser } from "@/lib/user-session";

export async function requireAdminUser(): Promise<AppUser> {
  const user = await resolveCurrentUser();
  if (!canAccessAdminPages(user)) {
    redirect("/semaine?forbidden=admin");
  }
  return user!;
}

export async function requireKpiResponsible(): Promise<AppUser> {
  const user = await resolveCurrentUser();
  if (!canEditWeekRetour(user)) {
    redirect("/saisie?forbidden=retour");
  }
  return user!;
}
