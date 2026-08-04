import { Dashboard } from "@/components/Dashboard";
import { currentPeriodId } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <Dashboard initialPeriod={currentPeriodId()} />;
}
