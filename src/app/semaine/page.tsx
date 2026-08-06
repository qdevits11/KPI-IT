import { redirect } from "next/navigation";
import { currentWeekId } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Redirection vers l’accueil unifié. */
export default async function SemainePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; forbidden?: string }>;
}) {
  const params = await searchParams;
  const week =
    params.week && /^\d{4}-S\d{2}$/.test(params.week)
      ? params.week
      : currentWeekId();
  const q = new URLSearchParams();
  q.set("week", week);
  if (params.forbidden) q.set("forbidden", params.forbidden);
  redirect(`/?${q.toString()}`);
}
