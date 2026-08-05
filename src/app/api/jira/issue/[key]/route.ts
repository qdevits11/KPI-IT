import { NextResponse } from "next/server";
import {
  assignIssue,
  getIssueActionMeta,
  setIssueCategory,
  transitionIssue,
} from "@/lib/jira-actions";
import { resolveTicketWriteConnection } from "@/lib/jira-oauth";
import { sanitizeConnection } from "@/lib/jira-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ key: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { key } = await params;
  const conn = await resolveTicketWriteConnection();
  if (!conn) {
    return NextResponse.json(
      {
        ok: false,
        needOAuth: true,
        error:
          "Reconnectez-vous (Microsoft / Atlassian) pour modifier les tickets.",
      },
      { status: 401 },
    );
  }

  try {
    const meta = await getIssueActionMeta(key, conn);
    return NextResponse.json({
      ok: true,
      meta,
      connection: sanitizeConnection(conn),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Erreur lecture ticket",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  const { key } = await params;
  const conn = await resolveTicketWriteConnection();
  if (!conn) {
    return NextResponse.json(
      {
        ok: false,
        needOAuth: true,
        error:
          "Reconnectez-vous (Microsoft / Atlassian) pour modifier les tickets.",
      },
      { status: 401 },
    );
  }

  if (conn.authMode !== "oauth") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Les modifications de tickets nécessitent un compte de sync en OAuth (Sync Jira). Le login utilisateur ne suffit pas.",
        needOAuth: true,
      },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: "transition" | "assign" | "category";
    transitionId?: string;
    accountId?: string | null;
    category?: string;
  };

  try {
    if (body.action === "transition") {
      if (!body.transitionId) {
        return NextResponse.json(
          { ok: false, error: "transitionId requis" },
          { status: 400 },
        );
      }
      await transitionIssue(key, body.transitionId, conn);
    } else if (body.action === "assign") {
      await assignIssue(
        key,
        body.accountId === undefined ? null : body.accountId,
        conn,
      );
    } else if (body.action === "category") {
      if (!body.category?.trim()) {
        return NextResponse.json(
          { ok: false, error: "category requis" },
          { status: 400 },
        );
      }
      await setIssueCategory(key, body.category.trim(), conn);
    } else {
      return NextResponse.json(
        { ok: false, error: "action invalide (transition|assign|category)" },
        { status: 400 },
      );
    }

    const meta = await getIssueActionMeta(key, conn);
    return NextResponse.json({ ok: true, meta });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Action Jira échouée",
      },
      { status: 500 },
    );
  }
}
