export const VENUE_TYPES = [
  { value: "Restaurant", label: "Restaurant" },
  { value: "Pub", label: "Pub" },
  { value: "Bar", label: "Bar" },
  { value: "Lounge", label: "Lounge" },
  { value: "Cafe", label: "Café" },
] as const;

export const VENUE_TYPE_VALUES = VENUE_TYPES.map(({ value }) => value);

export function normalizeVenueType(value: string) {
  return VENUE_TYPE_VALUES.includes(value as (typeof VENUE_TYPE_VALUES)[number]) ? value : "Restaurant";
}
