import { ManualEntryForm } from "@/components/ManualEntryForm";
import { currentWeekId } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function SaisiePage() {
  return <ManualEntryForm initialWeek={currentWeekId()} />;
}
