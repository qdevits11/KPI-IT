import { TicketStatsView } from "@/components/TicketStatsView";
import { isoWeekPartsFromDate, todayIsoDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default function AnalyseParTypePage() {
  const year = isoWeekPartsFromDate(todayIsoDate()).year;
  return <TicketStatsView dimension="type" initialYear={year} />;
}
