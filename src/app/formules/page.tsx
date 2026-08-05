import { FormulasList } from "@/components/FormulasList";
import { requireAdminUser } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function FormulesPage() {
  await requireAdminUser();
  return <FormulasList />;
}
