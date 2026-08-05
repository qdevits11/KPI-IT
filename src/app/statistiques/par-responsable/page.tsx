import { TicketStatsView } from "@/components/TicketStatsView";

export const dynamic = "force-dynamic";

export default function StatsParResponsablePage() {
  return <TicketStatsView dimension="assignee" initialYear={2026} />;
}
