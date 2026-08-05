import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Ancienne URL — redirige vers /statistiques/par-assigne */
export default function StatsParResponsableRedirect() {
  redirect("/statistiques/par-assigne");
}
