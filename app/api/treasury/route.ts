import { NextResponse } from "next/server";
import { CONFIG } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    treasuryAddress: CONFIG.TREASURY_ADDRESS ?? null,
    usdcAddress: CONFIG.USDC_ADDRESS ?? null,
    chainId: CONFIG.CHAIN_ID,
    explorerBase: CONFIG.EXPLORER_BASE,
    onchainAvailable: Boolean(
      CONFIG.TREASURY_ADDRESS && CONFIG.USDC_ADDRESS && CONFIG.RPC_URL && CONFIG.TREASURY_PRIVATE_KEY,
    ),
  });
}
