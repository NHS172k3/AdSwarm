import { NextResponse } from "next/server";
import { getRunAsync } from "@/lib/audit-store";
import { CONFIG } from "@/lib/config";
import { verifyTransactionProof } from "@/lib/payment";
import { getPublisherSlot } from "@/lib/publishers";

export const runtime = "nodejs";

async function paymentProofExistsForRun(runId: string, proof: string): Promise<boolean> {
  const run = await getRunAsync(runId);
  if (!run) return false;
  return run.events.some((event) => event.type === "payment" && event.txHash === proof);
}

async function resolvePublisher(slotId: string, proof?: string, campaignId?: string) {
  const slot = getPublisherSlot(slotId);
  if (!slot) {
    return NextResponse.json({ error: "Unknown slot" }, { status: 404 });
  }

  if (!proof) {
    return NextResponse.json(
      {
        status: "payment_required",
        slotId: slot.id,
        publisher: slot.name,
        priceUsdc: slot.priceUsdc,
        address: slot.address,
        chain: CONFIG.CHAIN,
        usdcAddress: CONFIG.USDC_ADDRESS,
        message: "Payment proof required to unlock the placement.",
      },
      { status: 402 },
    );
  }

  if (campaignId && !(await paymentProofExistsForRun(campaignId, proof))) {
    return NextResponse.json({ error: "Payment proof not found for campaign" }, { status: 403 });
  }

  if (!campaignId && CONFIG.PAYMENT_MODE === "onchain-single") {
    const valid = await verifyTransactionProof(proof);
    if (!valid) {
      return NextResponse.json({ error: "Payment proof not found on-chain" }, { status: 403 });
    }
  }

  return NextResponse.json({
    status: "ok",
    slotId: slot.id,
    publisher: slot.name,
    priceUsdc: slot.priceUsdc,
    address: slot.address,
    placement: {
      slotId: slot.id,
      publisher: slot.name,
      priceUsdc: slot.priceUsdc,
      proof,
    },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slotId = searchParams.get("slotId");
  if (!slotId) {
    return NextResponse.json({ error: "slotId is required" }, { status: 400 });
  }
  return resolvePublisher(slotId, searchParams.get("proof") ?? undefined, searchParams.get("campaign_id") ?? undefined);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { slotId?: string; proof?: string; campaign_id?: string };
  if (!body.slotId) {
    return NextResponse.json({ error: "slotId is required" }, { status: 400 });
  }
  return resolvePublisher(body.slotId, body.proof, body.campaign_id);
}
