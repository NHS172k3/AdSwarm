from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class GenerationSettings:
    default_tier: str = "cheap"
    timeout_ms: int = 20_000
    video_min_budget_usdc: float = 25.0


@dataclass(frozen=True)
class AppConfig:
    payment_mode: str = field(default_factory=lambda: os.getenv("PAYMENT_MODE", "mock"))
    default_budget_usdc: float = 50.0
    min_campaign_budget_usdc: float = 0.5
    min_ad_spend_usdc: float = 0.10
    ad_buy_count: int = 30
    avg_placement_usdc: float = 0.035
    fee_range_fraction: dict[str, float] = field(
        default_factory=lambda: {"min": 0.03, "max": 0.15}
    )
    generation: GenerationSettings = field(default_factory=GenerationSettings)
    chain: str = "base-sepolia"
    chain_id: int = 84_532
    rpc_url: str | None = field(default_factory=lambda: os.getenv("RPC_URL"))
    usdc_address: str | None = field(default_factory=lambda: os.getenv("USDC_ADDRESS"))
    treasury_address: str | None = field(default_factory=lambda: os.getenv("TREASURY_ADDRESS"))
    explorer_base: str = "https://sepolia.basescan.org"
    send_delay_ms: int = 100
    mock_confirm_delay_ms: int = 400


CONFIG = AppConfig()

