import { NextResponse } from "next/server";
import {
  getAccessUsers,
  removeAccessUser,
  upsertAccessUser,
} from "@/lib/store";
import { requireAdminApi } from "@/lib/access-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminApi();
  if ("response" in gate) return gate.response;
  const accessUsers = await getAccessUsers();
  return NextResponse.json({ accessUsers });
}

export async function PUT(request: Request) {
  const gate = await requireAdminApi();
  if ("response" in gate) return gate.response;

  const body = (await request.json()) as {
    email?: string;
    displayName?: string;
    isAdmin?: boolean;
    isKpiResponsible?: boolean;
  };

  if (!body.email?.trim()) {
    return NextResponse.json({ error: "Email requis" }, { status: 400 });
  }

  try {
    const accessUsers = await upsertAccessUser({
      email: body.email,
      displayName: body.displayName,
      isAdmin: Boolean(body.isAdmin),
      isKpiResponsible: Boolean(body.isKpiResponsible),
    });
    return NextResponse.json({ accessUsers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const gate = await requireAdminApi();
  if ("response" in gate) return gate.response;

  const url = new URL(request.url);
  let email = url.searchParams.get("email") ?? "";
  if (!email) {
    try {
      const body = (await request.json()) as { email?: string };
      email = body.email ?? "";
    } catch {
      // ignore
    }
  }
  if (!email.trim()) {
    return NextResponse.json({ error: "Email requis" }, { status: 400 });
  }

  try {
    const accessUsers = await removeAccessUser(email);
    return NextResponse.json({ accessUsers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
