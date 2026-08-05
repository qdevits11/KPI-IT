import { YearOverview } from "@/components/YearOverview";

export const dynamic = "force-dynamic";

export default function VueAnnuellePage() {
  return <YearOverview initialYear={2026} />;
}
