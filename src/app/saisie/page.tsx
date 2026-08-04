import { ManualEntryForm } from "@/components/ManualEntryForm";
import { currentPeriodId } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function SaisiePage() {
  return <ManualEntryForm initialPeriod={currentPeriodId()} />;
}
