import { JiraSyncPanel } from "@/components/JiraSyncPanel";
import { currentPeriodId } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function JiraPage() {
  return <JiraSyncPanel initialPeriod={currentPeriodId()} />;
}
