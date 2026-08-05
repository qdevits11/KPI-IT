import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/access-api";
import { resetDatabase } from "@/lib/store";

/** Réinitialise la base KPI (vide). Admin uniquement. */
export async function POST() {
  const gate = await requireAdminApi();
  if ("response" in gate) return gate.response;

  const db = await resetDatabase();
  return NextResponse.json({
    ok: true,
    weeks: db.weeks.length,
    revision: db.revision,
    schemaVersion: db.schemaVersion,
  });
}
