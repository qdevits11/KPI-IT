import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Ancienne page Encodage — tout se fait depuis l’accueil. */
export default function SaisiePage() {
  redirect("/");
}
