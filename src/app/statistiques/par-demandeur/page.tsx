import { TicketStatsView } from "@/components/TicketStatsView";

export const dynamic = "force-dynamic";

export default function StatsParDemandeurPage() {
  return <TicketStatsView dimension="requester" initialYear={2026} />;
}
