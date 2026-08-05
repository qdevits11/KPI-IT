import { StatsNav } from "@/components/StatsNav";

export default function StatistiquesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <StatsNav />
      {children}
    </div>
  );
}
