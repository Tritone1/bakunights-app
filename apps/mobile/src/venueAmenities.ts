export const VENUE_AMENITIES = [
  { value: "SHISHA", label: "Shisha", icon: "cloud-outline" },
  { value: "VIP_ROOM", label: "VIP room", icon: "diamond-outline" },
  { value: "OUTDOOR_SEATING", label: "Outdoor", icon: "leaf-outline" },
  { value: "ROOFTOP", label: "Rooftop", icon: "business-outline" },
  { value: "LIVE_MUSIC", label: "Live music", icon: "musical-notes-outline" },
  { value: "SPORTS_SCREENS", label: "Sports", icon: "football-outline" },
  { value: "KARAOKE", label: "Karaoke", icon: "mic-outline" },
  { value: "PARKING", label: "Parking", icon: "car-outline" },
] as const;

export function amenityLabel(value: string) {
  return VENUE_AMENITIES.find((amenity) => amenity.value === value)?.label ?? value;
}

export function isVenueOpenNow(hoursJson?: { open?: string | null; close?: string | null } | null) {
  const parse = (value?: string | null) => {
    const match = value ? /^(\d{1,2}):(\d{2})$/.exec(value) : null;
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const opensAt = parse(hoursJson?.open);
  const closesAt = parse(hoursJson?.close);
  if (opensAt == null || closesAt == null) return false;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Baku", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const now = Number(parts.find((part) => part.type === "hour")?.value) * 60 + Number(parts.find((part) => part.type === "minute")?.value);
  return opensAt === closesAt || (opensAt < closesAt ? now >= opensAt && now < closesAt : now >= opensAt || now < closesAt);
}
