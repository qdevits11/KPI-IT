import { StatsOverview } from "@/components/StatsOverview";
import { isoWeekPartsFromDate, todayIsoDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default function AnalyseTicketsPage() {
  const year = isoWeekPartsFromDate(todayIsoDate()).year;
  return <StatsOverview initialYear={year} />;
}
