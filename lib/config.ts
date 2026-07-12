import type { CampaignMode } from "./types";

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const CONFIG = {
  PAYMENT_MODE: (process.env.PAYMENT_MODE ?? "mock") as CampaignMode,
  DEFAULT_BUDGET_USDC: 50,
  MIN_CAMPAIGN_BUDGET_USDC: 0.5,
  MIN_AD_SPEND_USDC: 0.1,
  AD_BUY_COUNT: 30,
  AVG_PLACEMENT_USDC: 0.035,
  FEE_RANGE_FRACTION: { min: 0.03, max: 0.15 },
  GENERATION: {
    DEFAULT_TIER: "cheap" as const,
    TIMEOUT_MS: 20000,
    VIDEO_MIN_BUDGET_USDC: 25,
  },
  CHAIN: "base-sepolia",
  CHAIN_ID: 84532,
  RPC_URL: process.env.RPC_URL,
  USDC_ADDRESS: process.env.USDC_ADDRESS,
  TREASURY_ADDRESS: process.env.TREASURY_ADDRESS,
  TREASURY_PRIVATE_KEY: process.env.TREASURY_PRIVATE_KEY,
  EXPLORER_BASE: "https://sepolia.basescan.org",
  SEND_DELAY_MS: 100,
  MOCK_CONFIRM_DELAY_MS: 400,
  AI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
  OPENAI_IMAGE_QUALITY: process.env.OPENAI_IMAGE_QUALITY ?? "low",
  OPENAI_KEY: process.env.OPENAI_API_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_WALLETCONNECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_ID,
  VIDEO_ENABLED_DEFAULT: false,
  VIDEO_PROVIDER: process.env.VIDEO_PROVIDER ?? "runway",
  VIDEO_TIMEOUT_MS: readNumber(process.env.VIDEO_TIMEOUT_MS, 180000),
  OPENAI_EXPERIMENTAL_VIDEO_ENABLED: process.env.OPENAI_EXPERIMENTAL_VIDEO_ENABLED === "true",
  OPENAI_EXPERIMENTAL_VIDEO_MODEL: process.env.OPENAI_EXPERIMENTAL_VIDEO_MODEL ?? "sora-2",
} as const;

export const isSupabaseConfigured = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_SERVICE_ROLE_KEY);
export const isOpenAIConfigured = Boolean(CONFIG.OPENAI_KEY);
