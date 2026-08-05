import { JiraSyncPanel } from "@/components/JiraSyncPanel";
import { currentWeekId } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function JiraPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const week =
    params.week && /^\d{4}-S\d{2}$/.test(params.week)
      ? params.week
      : currentWeekId();
  return <JiraSyncPanel initialWeek={week} />;
}
