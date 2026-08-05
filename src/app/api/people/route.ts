import { NextResponse } from "next/server";
import { getPeopleDirectory } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const people = await getPeopleDirectory();
  return NextResponse.json({ people });
}
