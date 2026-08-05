import { NextResponse } from "next/server";
import {
  addResponsible,
  getResponsibles,
  removeResponsible,
} from "@/lib/store";
import { requireAdminApi } from "@/lib/access-api";

export async function GET() {
  const responsibles = await getResponsibles();
  return NextResponse.json({ responsibles });
}

export async function PUT(request: Request) {
  const gate = await requireAdminApi();
  if ("response" in gate) return gate.response;

  const body = (await request.json()) as {
    action?: "add" | "remove";
    name?: string;
  };

  if (!body.name?.trim() || (body.action !== "add" && body.action !== "remove")) {
    return NextResponse.json(
      { error: "Action (add|remove) et name requis" },
      { status: 400 },
    );
  }

  try {
    const responsibles =
      body.action === "add"
        ? await addResponsible(body.name)
        : await removeResponsible(body.name);
    return NextResponse.json({ responsibles });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
