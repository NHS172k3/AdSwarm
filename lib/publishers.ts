export type PublisherSlot = {
  id: string;
  name: string;
  priceUsdc: number;
  description: string;
  address: `0x${string}`;
};

export const PUBLISHER_SLOTS: PublisherSlot[] = [
  {
    id: "twitchside_banner",
    name: "TwitchSide Banner",
    priceUsdc: 0.05,
    description: "High-frequency placements near late-night streams.",
    address: "0x1111111111111111111111111111111111111111",
  },
  {
    id: "gamerforum_sidebar",
    name: "GamerForum Sidebar",
    priceUsdc: 0.03,
    description: "Thread-adjacent visibility for intent-rich communities.",
    address: "0x2222222222222222222222222222222222222222",
  },
  {
    id: "yt_preroll_slot",
    name: "YT Pre-roll Slot",
    priceUsdc: 0.08,
    description: "Quick sightline before highlight reels and reviews.",
    address: "0x3333333333333333333333333333333333333333",
  },
  {
    id: "discord_server_promo",
    name: "Discord Server Promo",
    priceUsdc: 0.02,
    description: "Pinned inside creator and clan channels.",
    address: "0x4444444444444444444444444444444444444444",
  },
  {
    id: "r_gaming_promoted",
    name: "r/Gaming Promoted",
    priceUsdc: 0.06,
    description: "Promoted feed slot for broad gaming reach.",
    address: "0x5555555555555555555555555555555555555555",
  },
  {
    id: "esports_livestream_l3",
    name: "Esports Livestream L3",
    priceUsdc: 0.09,
    description: "Premium placement for live match audiences.",
    address: "0x6666666666666666666666666666666666666666",
  },
  {
    id: "mobile_game_interstitial",
    name: "Mobile Game Interstitial",
    priceUsdc: 0.04,
    description: "Interruptive but affordable high-impression inventory.",
    address: "0x7777777777777777777777777777777777777777",
  },
  {
    id: "gg_newsletter_slot",
    name: "GG Newsletter Slot",
    priceUsdc: 0.03,
    description: "Curated newsletter placement with reliable CTR.",
    address: "0x8888888888888888888888888888888888888888",
  },
];

export function getPublisherSlot(slotId: string): PublisherSlot | null {
  return PUBLISHER_SLOTS.find((slot) => slot.id === slotId) ?? null;
}
