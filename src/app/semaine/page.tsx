import { redirect } from "next/navigation";
import { clampWeekIdToCurrent } from "@/lib/dates";

export const dynamic = "force-dynamic";

/** Redirection vers l’accueil unifié. */
export default async function SemainePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; forbidden?: string }>;
}) {
  const params = await searchParams;
  const week = clampWeekIdToCurrent(params.week);
  const q = new URLSearchParams();
  q.set("week", week);
  if (params.forbidden) q.set("forbidden", params.forbidden);
  redirect(`/?${q.toString()}`);
}
