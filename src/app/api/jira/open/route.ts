import { NextResponse } from "next/server";
import { resolveJiraConnection, sanitizeConnection } from "@/lib/jira-auth";
import { fetchOpenTicketsSnapshot } from "@/lib/jira-tickets";

export const dynamic = "force-dynamic";

/** Snapshot live des tickets ouverts (non résolus) à l’instant T. */
export async function GET() {
  const conn = await resolveJiraConnection();
  if (!conn) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Connectez d’abord votre compte Jira (page Sync Jira).",
        configured: false,
      },
      { status: 401 },
    );
  }

  try {
    const snapshot = await fetchOpenTicketsSnapshot(conn);
    return NextResponse.json({
      ok: true,
      configured: true,
      connection: sanitizeConnection(conn),
      ...snapshot,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        error: err instanceof Error ? err.message : "Erreur lecture tickets ouverts",
      },
      { status: 500 },
    );
  }
}
