import assert from "node:assert/strict";
import test from "node:test";
import { buildConciergeInstructions, parseConciergeOutput, type ConciergeCatalogVenue } from "../src/lib/concierge.js";

const venue: ConciergeCatalogVenue = {
  id: "venue-1",
  name: "Baku Lounge",
  cuisine: "Lounge",
  address: "Nizami Street",
  rating: 4.7,
  priceLevel: 3,
  amenities: ["shisha", "vip_room"],
  dietaryTags: [],
  hours: { open: "12:00", close: "02:00" },
  distanceKm: 1.4,
  liveOffer: null,
};

test("concierge prompt explicitly handles informal Azerbaijani and stays grounded", () => {
  const prompt = buildConciergeInstructions("az", [venue], "Friday, 20:30");
  assert.match(prompt, /qelyan olan sakit yer/);
  assert.match(prompt, /Never invent a venue/);
  assert.match(prompt, /"vip_room"/);
  assert.match(prompt, /Azerbaijani/);
});

test("concierge output removes unknown and duplicate venue ids", () => {
  const result = parseConciergeOutput({
    reply: "Sizin üçün uyğun məkan tapdım.",
    recommendations: [
      { venueId: "venue-1", reason: "VIP otağı və şişası var." },
      { venueId: "made-up", reason: "Unknown" },
      { venueId: "venue-1", reason: "Duplicate" },
    ],
    followUp: "",
  }, new Set(["venue-1"]));
  assert.deepEqual(result.recommendations, [{ venueId: "venue-1", reason: "VIP otağı və şişası var." }]);
});
