import { NextResponse } from "next/server";
import { getStorageStatus } from "@/lib/supabase-db";
import { requireAdminApi } from "@/lib/api";

/** Diagnostic : backend de persistance actif (Supabase / Blob / disque). */
export async function GET() {
  const gate = await requireAdminApi();
  if ("response" in gate) return gate.response;

  const status = await getStorageStatus();
  return NextResponse.json(status);
}
