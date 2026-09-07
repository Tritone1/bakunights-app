export type Restaurant = {
  id: string;
  name: string;
  address: string;
  cuisine: string;
  rating?: number;
  lat: number;
  lng: number;
  photoUrl?: string | null;
  phone?: string | null;
  isVerifiedTrusted?: boolean;
  honestyRate?: number | null;
  liveDeal?: Deal | null;
};

export type OfferMenuItem = {
  menuItemId: string;
  overridePriceAzn?: string | number | null;
  quantity?: number | null;
  freeQuantity?: number | null;
  menuItem: {
    id: string;
    name: string;
    description?: string | null;
    photoUrl?: string | null;
    priceAzn: string | number;
    category?: { name: string } | null;
  };
};

export type Deal = {
  id: string;
  title: string;
  description: string;
  menuItem?: string | null;
  photoUrl?: string | null;
  scope?: "WHOLE_MENU" | "CATEGORY" | "SPECIFIC_ITEMS";
  offerType?: "discount" | "combo" | "set_menu" | "perk" | "event" | "bundle" | "other";
  discountPct?: number | null;
  offerPriceAzn?: string | number | null;
  minimumSpendAzn?: string | number | null;
  freeMenuItemId?: string | null;
  freeMenuItemQty?: number | null;
  freeMenuItem?: OfferMenuItem["menuItem"] | null;
  isFlash?: boolean;
  tag?: string;
  dietaryTags?: string[];
  startsAt?: string;
  endsAt: string;
  dealRating?: number | null;
  ratingCount?: number;
  distanceMiles?: number | null;
  contentLanguage?: string | null;
  isMachineTranslated?: boolean;
  scopeCategory?: { id: string; name: string } | null;
  offerMenuItems?: OfferMenuItem[];
  restaurant: Restaurant;
};

export type HomepageStats = { activeVenues: number; liveDeals: number; areas: number };

export type Redemption = {
  id: string;
  redemptionCode: string;
  qrDataUrl?: string;
  redeemedAt?: string | null;
};

export type PointReward = {
  id: string;
  rewardCode: string;
  pointsSpent: number;
  discountPct: number;
  maxBillAzn: number;
  issuedAt: string;
  redeemedAt: string | null;
};

export type PointsStatus = {
  pointsBalance: number;
  lifetimePoints: number;
  pointsToReward: number;
  rewardThreshold: number;
  canSpin: boolean;
  pendingSpins: number;
  lastSpin: { points: number; createdAt: string } | null;
  activeRewards: PointReward[];
};
