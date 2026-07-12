import { randomBytes, randomUUID } from "crypto";

export function randomHex(bytes = 32): `0x${string}` {
  return `0x${randomBytes(bytes).toString("hex")}` as `0x${string}`;
}

export function randomAddress(): `0x${string}` {
  return `0x${randomBytes(20).toString("hex")}` as `0x${string}`;
}

export function fakeExplorerUrl(hash: string): string {
  return `https://sepolia.basescan.org/tx/${hash}`;
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

export function roundMoney(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}
