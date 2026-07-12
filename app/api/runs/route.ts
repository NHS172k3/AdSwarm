import { NextResponse } from "next/server";
import { getRecentRunsAsync, getRunAsync, listRunEventsAsync } from "@/lib/audit-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  if (runId) {
    const run = await getRunAsync(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json({ run, events: await listRunEventsAsync(runId) });
  }

  return NextResponse.json({ runs: await getRecentRunsAsync(20) });
}
