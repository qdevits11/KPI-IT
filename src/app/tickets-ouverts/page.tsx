import { OpenTicketsView } from "@/components/OpenTicketsView";
import { resolveJiraConnection } from "@/lib/jira-auth";
import { fetchOpenTicketsSnapshot } from "@/lib/jira-tickets";
import type { OpenTicketsSnapshot } from "@/lib/jira-tickets";

export const dynamic = "force-dynamic";

export default async function TicketsOuvertsPage() {
  let initial: OpenTicketsSnapshot | null = null;
  let initialError: string | null = null;

  const conn = await resolveJiraConnection();
  if (!conn) {
    initialError =
      "Connectez d’abord votre compte Jira (page Sync Jira).";
  } else {
    try {
      initial = await fetchOpenTicketsSnapshot(conn);
    } catch (err) {
      initialError =
        err instanceof Error
          ? err.message
          : "Impossible de charger les tickets ouverts";
    }
  }

  return (
    <OpenTicketsView initialData={initial} initialError={initialError} />
  );
}
