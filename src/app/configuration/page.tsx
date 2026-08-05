import { ConfigPanel } from "@/components/ConfigPanel";
import { requireAdminUser } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function ConfigurationPage() {
  await requireAdminUser();
  return <ConfigPanel />;
}
