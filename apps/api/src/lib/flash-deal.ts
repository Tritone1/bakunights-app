export const FLASH_DEAL_MIN_DISCOUNT_PCT = 25;
export const FLASH_DEAL_MAX_DURATION_MS = 6 * 60 * 60 * 1000;
export const FLASH_DEAL_RULES_MESSAGE = "Flash deals need an effective discount of at least 25% and a duration of 6 hours or less.";
// Percentage discount, combo/set-menu/bundle savings all qualify; perk and event offers have no comparable percentage.
export const FLASH_DEAL_ELIGIBLE_OFFER_TYPES = ["discount", "combo", "set_menu", "bundle"] as const;

type FlashDealFields = {
  isFlash: boolean;
  offerType: string;
  discountPct?: number | null;
  startsAt: Date;
  endsAt: Date;
};

export function isFlashDealEligible(input: Omit<FlashDealFields, "isFlash">) {
  const durationMs = input.endsAt.getTime() - input.startsAt.getTime();
  return (FLASH_DEAL_ELIGIBLE_OFFER_TYPES as readonly string[]).includes(input.offerType)
    && input.discountPct != null
    && input.discountPct >= FLASH_DEAL_MIN_DISCOUNT_PCT
    && durationMs > 0
    && durationMs <= FLASH_DEAL_MAX_DURATION_MS;
}

export function flashDealValidationError(input: FlashDealFields) {
  return input.isFlash && !isFlashDealEligible(input) ? FLASH_DEAL_RULES_MESSAGE : null;
}
