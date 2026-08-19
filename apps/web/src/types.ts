export type User = {
  id: string;
  email: string;
  name: string;
  role: "CONSUMER" | "MERCHANT" | "ADMIN";
  avatar?: string;
};

export type Restaurant = {
  id: string;
  name: string;
  address: string;
  cuisine: string;
  rating?: number;
  lat: number;
  lng: number;
  photoUrl?: string;
  phone?: string;
  hoursJson?: string;
  isVerifiedTrusted?: boolean;
  honestyRate?: number | null;
};

export type Deal = {
  id: string;
  title: string;
  description: string;
  menuItem?: string | null;
  photoUrl?: string | null;
  scope?: "WHOLE_MENU" | "CATEGORY" | "SPECIFIC_ITEMS";
  scopeCategory?: { id: string; name: string } | null;
  offerMenuItems?: { menuItemId: string; menuItem: { id: string; name: string; photoUrl?: string | null; priceAzn: string | number; category?: { name: string } } }[];
  offerType?: "discount" | "combo" | "set_menu" | "perk" | "event" | "bundle" | "other";
  discountPct?: number | null;
  tag?: string;
  dietaryTags?: string[];
  startsAt?: string;
  endsAt: string;
  dealRating?: number;
  ratingCount?: number;
  distanceMiles?: number | null;
  status?: "draft" | "pending_review" | "approved" | "rejected" | "expired";
  restaurant: Restaurant;
};

export type Redemption = {
  id: string;
  redemptionCode: string;
  qrDataUrl?: string;
  redeemedAt?: string | null;
  feedbackSkippedAt?: string | null;
  feedback?: { id: string; wasHonored: boolean; comment?: string | null } | null;
};
