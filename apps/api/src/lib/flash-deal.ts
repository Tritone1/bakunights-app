export const FLASH_DEAL_MIN_DISCOUNT_PCT = 25;
export const FLASH_DEAL_MAX_DURATION_MS = 6 * 60 * 60 * 1000;
export const FLASH_DEAL_RULES_MESSAGE = "Flash deals must be percentage discount offers with at least 25% off and a duration of 6 hours or less.";

type FlashDealFields = {
  isFlash: boolean;
  offerType: string;
  discountPct?: number | null;
  startsAt: Date;
  endsAt: Date;
};

export function isFlashDealEligible(input: Omit<FlashDealFields, "isFlash">) {
  const durationMs = input.endsAt.getTime() - input.startsAt.getTime();
  return input.offerType === "discount"
    && input.discountPct != null
    && input.discountPct >= FLASH_DEAL_MIN_DISCOUNT_PCT
    && durationMs > 0
    && durationMs <= FLASH_DEAL_MAX_DURATION_MS;
}

export function flashDealValidationError(input: FlashDealFields) {
  return input.isFlash && !isFlashDealEligible(input) ? FLASH_DEAL_RULES_MESSAGE : null;
}
