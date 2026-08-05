import { TicketStatsView } from "@/components/TicketStatsView";

export const dynamic = "force-dynamic";

export default function StatsParAssignePage() {
  return <TicketStatsView dimension="assignee" initialYear={2026} />;
}
