import { createPublicClient, createWalletClient, erc20Abi, http, isAddress, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { CONFIG } from "./config";
import { fakeExplorerUrl, randomHex, roundMoney, sleep } from "./mock";
import type { AgentId, CampaignMode } from "./types";

export interface PayResult {
  txHash: string;
  explorerUrl: string;
  status: "pending";
}

export interface ConfirmResult {
  status: "confirmed";
  blockNumber?: number;
}

export interface PaymentProvider {
  pay(from: AgentId | "treasury", toAddress: string, amountUsdc: number, memo: string): Promise<PayResult>;
  confirm(txHash: string): Promise<ConfirmResult>;
}

class MockPaymentProvider implements PaymentProvider {
  async pay(_from: AgentId | "treasury", _toAddress: string, amountUsdc: number, _memo: string): Promise<PayResult> {
    const txHash = randomHex(32);
    return {
      txHash,
      explorerUrl: fakeExplorerUrl(txHash),
      status: "pending",
    };
  }

  async confirm(_txHash: string): Promise<ConfirmResult> {
    await sleep(CONFIG.MOCK_CONFIRM_DELAY_MS);
    return { status: "confirmed" };
  }
}

class OnchainPaymentProvider implements PaymentProvider {
  private walletClient;
  private publicClient;

  constructor() {
    if (!CONFIG.TREASURY_PRIVATE_KEY || !CONFIG.TREASURY_ADDRESS || !CONFIG.RPC_URL || !CONFIG.USDC_ADDRESS) {
      throw new Error("On-chain mode requires TREASURY_PRIVATE_KEY, TREASURY_ADDRESS, RPC_URL, and USDC_ADDRESS.");
    }
    const account = privateKeyToAccount(CONFIG.TREASURY_PRIVATE_KEY as `0x${string}`);
    if (account.address.toLowerCase() !== CONFIG.TREASURY_ADDRESS.toLowerCase()) {
      throw new Error("TREASURY_PRIVATE_KEY does not match TREASURY_ADDRESS.");
    }
    this.walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(CONFIG.RPC_URL),
    });
    this.publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(CONFIG.RPC_URL),
    });
  }

  async pay(_from: AgentId | "treasury", toAddress: string, amountUsdc: number, _memo: string): Promise<PayResult> {
    if (!isAddress(toAddress)) {
      throw new Error(`Invalid payment destination: ${toAddress}`);
    }
    const txHash = await this.walletClient.writeContract({
      address: CONFIG.USDC_ADDRESS as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [toAddress as `0x${string}`, parseUnits(roundMoney(amountUsdc).toFixed(6), 6)],
      chain: baseSepolia,
    });
    return {
      txHash,
      explorerUrl: `${CONFIG.EXPLORER_BASE}/tx/${txHash}`,
      status: "pending",
    };
  }

  async confirm(txHash: string): Promise<ConfirmResult> {
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      confirmations: 1,
      timeout: 120_000,
    });
    return {
      status: "confirmed",
      blockNumber: Number(receipt.blockNumber),
    };
  }
}

export function createPaymentProvider(mode: CampaignMode): PaymentProvider {
  if (mode === "onchain-single") {
    return new OnchainPaymentProvider();
  }
  if (mode === "onchain-sovereign") {
    throw new Error("onchain-sovereign is not wired in this runtime yet. Use mock or onchain-single.");
  }
  return new MockPaymentProvider();
}

export async function verifyTransactionProof(txHash: string): Promise<boolean> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return false;
  }
  if (!CONFIG.RPC_URL) {
    return true;
  }
  try {
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(CONFIG.RPC_URL),
    });
    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });
    return receipt.status === "success";
  } catch {
    return false;
  }
}
