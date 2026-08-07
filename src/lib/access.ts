import { redirect } from "next/navigation";
import { canAccessAdminPages, type AppUser } from "@/lib/roles";
import { resolveCurrentUser } from "@/lib/user-session";

export async function requireAdminUser(): Promise<AppUser> {
  const user = await resolveCurrentUser();
  if (!canAccessAdminPages(user)) {
    redirect("/?forbidden=admin");
  }
  return user!;
}
