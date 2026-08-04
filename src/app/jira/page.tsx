import { JiraSyncPanel } from "@/components/JiraSyncPanel";

export const dynamic = "force-dynamic";

export default function JiraPage() {
  return <JiraSyncPanel initialWeek="2026-S31" />;
}
