import { TicketStatsView } from "@/components/TicketStatsView";
import { isoWeekPartsFromDate, todayIsoDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default function AnalyseParDemandeurPage() {
  const year = isoWeekPartsFromDate(todayIsoDate()).year;
  return <TicketStatsView dimension="requester" initialYear={year} />;
}
