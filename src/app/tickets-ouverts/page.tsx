import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Ancienne page Tickets — contenu intégré à l’accueil. */
export default function TicketsOuvertsPage() {
  redirect("/");
}
