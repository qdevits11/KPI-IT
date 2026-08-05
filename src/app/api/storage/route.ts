import { NextResponse } from "next/server";
import { getStorageStatus } from "@/lib/supabase-db";

/** Diagnostic : backend de persistance actif (Supabase / Blob / disque). */
export async function GET() {
  const status = await getStorageStatus();
  return NextResponse.json(status);
}
