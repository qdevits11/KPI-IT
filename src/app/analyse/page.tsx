import { YearOverview } from "@/components/YearOverview";
import { isoWeekPartsFromDate, todayIsoDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default function AnalysePage() {
  const year = isoWeekPartsFromDate(todayIsoDate()).year;
  return <YearOverview initialYear={year} />;
}
