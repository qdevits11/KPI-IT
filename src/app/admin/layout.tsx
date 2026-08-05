import { AdminNav } from "@/components/AdminNav";
import { requireAdminUser } from "@/lib/access";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminUser();
  return (
    <div className="space-y-6">
      <AdminNav />
      {children}
    </div>
  );
}
