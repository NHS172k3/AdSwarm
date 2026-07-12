import { NextResponse } from "next/server";
import { getRecentRunsAsync } from "@/lib/audit-store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ runs: await getRecentRunsAsync(20) });
}
