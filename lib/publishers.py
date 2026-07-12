from __future__ import annotations

from typing import Any

PUBLISHER_SLOTS: list[dict[str, Any]] = [
    {"slot_id": "twitchside_banner", "publisher": "TwitchSide Banner", "price_usdc": 0.05},
    {"slot_id": "gamerforum_sidebar", "publisher": "GamerForum Sidebar", "price_usdc": 0.03},
    {"slot_id": "yt_preroll_slot", "publisher": "YT Pre-roll Slot", "price_usdc": 0.08},
    {"slot_id": "discord_server_promo", "publisher": "Discord Server Promo", "price_usdc": 0.02},
    {"slot_id": "r_gaming_promoted", "publisher": "r/Gaming Promoted", "price_usdc": 0.06},
    {"slot_id": "esports_livestream_l3", "publisher": "Esports Livestream L3", "price_usdc": 0.09},
    {"slot_id": "mobile_game_interstitial", "publisher": "Mobile Game Interstitial", "price_usdc": 0.04},
    {"slot_id": "gg_newsletter_slot", "publisher": "GG Newsletter Slot", "price_usdc": 0.03},
]


def get_slot(slot_id: str) -> dict[str, Any] | None:
    for slot in PUBLISHER_SLOTS:
        if slot["slot_id"] == slot_id:
            return slot
    return None


def cycle_slots(count: int) -> list[dict[str, Any]]:
    if count <= 0:
        return []
    slots: list[dict[str, Any]] = []
    while len(slots) < count:
        slots.extend(PUBLISHER_SLOTS)
    return slots[:count]

