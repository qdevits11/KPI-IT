import { redirect } from "next/navigation";

export default async function JiraRedirect({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const qs =
    params.week && /^\d{4}-S\d{2}$/.test(params.week)
      ? `?week=${encodeURIComponent(params.week)}`
      : "";
  redirect(`/admin/operations${qs}`);
}
