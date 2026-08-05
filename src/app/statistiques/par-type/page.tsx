import { TicketStatsView } from "@/components/TicketStatsView";

export const dynamic = "force-dynamic";

export default function StatsParTypePage() {
  return <TicketStatsView dimension="type" initialYear={2026} />;
}
