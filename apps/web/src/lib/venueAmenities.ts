export const VENUE_AMENITIES = [
  { value: "SHISHA", label: "Shisha" },
  { value: "VIP_ROOM", label: "VIP / private room" },
  { value: "OUTDOOR_SEATING", label: "Outdoor seating" },
  { value: "ROOFTOP", label: "Rooftop" },
  { value: "LIVE_MUSIC", label: "Live music" },
  { value: "SPORTS_SCREENS", label: "Sports screens" },
  { value: "KARAOKE", label: "Karaoke" },
  { value: "PARKING", label: "Parking" },
] as const;

export type VenueAmenity = (typeof VENUE_AMENITIES)[number]["value"];

export function amenityLabel(value: string) {
  return VENUE_AMENITIES.find((amenity) => amenity.value === value)?.label ?? value;
}

export function isVenueOpenNow(hoursJson?: { open?: string | null; close?: string | null } | null) {
  const open = hoursJson?.open;
  const close = hoursJson?.close;
  if (!open || !close) return false;
  const parse = (value: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const opensAt = parse(open);
  const closesAt = parse(close);
  if (opensAt == null || closesAt == null) return false;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Baku", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const now = Number(parts.find((part) => part.type === "hour")?.value) * 60 + Number(parts.find((part) => part.type === "minute")?.value);
  return opensAt === closesAt || (opensAt < closesAt ? now >= opensAt && now < closesAt : now >= opensAt || now < closesAt);
}
