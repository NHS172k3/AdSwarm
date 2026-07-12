import { NextResponse } from "next/server";
import { buildCampaignPlan } from "@/lib/campaign";
import type { CampaignDraft } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const draft = (await request.json()) as CampaignDraft;
  const plan = await buildCampaignPlan(draft);
  return NextResponse.json(plan);
}
