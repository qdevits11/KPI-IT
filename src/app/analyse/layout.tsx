import { AnalyseNav } from "@/components/AnalyseNav";

export default function AnalyseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <AnalyseNav />
      {children}
    </div>
  );
}
