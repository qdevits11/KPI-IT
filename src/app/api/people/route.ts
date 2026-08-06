import { NextResponse } from "next/server";
import { getPeopleDirectory } from "@/lib/store";
import { requireSessionApi } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireSessionApi();
  if ("response" in gate) return gate.response;

  const people = await getPeopleDirectory();
  return NextResponse.json({ people });
}
