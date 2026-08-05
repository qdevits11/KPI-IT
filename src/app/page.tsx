import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Ancienne racine — redirige vers Semaine (avec ?week= conservé). */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; forbidden?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.week && /^\d{4}-S\d{2}$/.test(params.week)) {
    qs.set("week", params.week);
  }
  if (params.forbidden) qs.set("forbidden", params.forbidden);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  redirect(`/semaine${suffix}`);
}
