import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });

const prisma = new PrismaClient();

const restaurants = [
  ["Sunbird Diner", "American", "1201 S Congress Ave", 30.2505, -97.7491, 4.7, ["vegetarian"]],
  ["Luna Roja", "Mexican", "1600 E 6th St", 30.2632, -97.7232, 4.8, ["vegan", "gluten-free"]],
  ["Curry Up", "Indian", "1901 Guadalupe St", 30.2825, -97.7418, 4.6, ["vegan", "halal"]],
  ["The Noodle Club", "Japanese", "501 W 6th St", 30.2693, -97.7481, 4.5, ["vegetarian"]],
  ["Olive & Thyme", "Mediterranean", "2121 E Cesar Chavez St", 30.2548, -97.7178, 4.9, ["vegan", "halal", "gluten-free"]],
  ["Hot Bird", "Southern", "801 Barton Springs Rd", 30.2604, -97.7552, 4.4, []],
  ["Pho Real", "Vietnamese", "1100 N Lamar Blvd", 30.2769, -97.7528, 4.7, ["gluten-free"]],
  ["Greenhouse", "Healthy", "2427 Webberville Rd", 30.2633, -97.7141, 4.6, ["vegan", "vegetarian", "gluten-free"]],
  ["Nonna's Table", "Italian", "1417 S 1st St", 30.2495, -97.7554, 4.8, ["vegetarian"]],
  ["Seoul Bowl", "Korean", "2000 S Lamar Blvd", 30.2481, -97.7719, 4.7, ["gluten-free"]],
  ["Smoke Stack", "BBQ", "100 Red River St", 30.2601, -97.7384, 4.5, ["gluten-free"]],
  ["Baker Street", "Bakery", "301 W 2nd St", 30.2645, -97.7474, 4.6, ["vegetarian"]],
  ["Coastal Catch", "Seafood", "98 San Jacinto Blvd", 30.2615, -97.7415, 4.8, ["gluten-free"]],
  ["Za-Zoom", "Pizza", "1501 E 5th St", 30.2610, -97.7260, 4.4, ["vegan", "vegetarian"]],
  ["Golden Hour", "Cafe", "1700 S Lamar Blvd", 30.2520, -97.7650, 4.9, ["vegan", "vegetarian"]],
  ["Falafel Radio", "Middle Eastern", "3101 Manor Rd", 30.2862, -97.7049, 4.7, ["vegan", "halal"]],
  ["Bangkok Local", "Thai", "900 W Mary St", 30.2483, -97.7595, 4.6, ["vegan", "gluten-free"]],
  ["Little Havana", "Cuban", "2300 E 7th St", 30.2624, -97.7151, 4.5, []],
] as const;

const titles = [
  "Sunrise stack for less", "Two-for-one taco flight", "Curry lunch knockout", "Half-price ramen hour",
  "Mezze platter special", "Hot chicken happy hour", "Pho lunch reset", "Build-a-bowl bonus",
  "Pasta night steal", "Bibimbap power lunch", "Brisket plate break", "Coffee + croissant combo",
  "Oyster hour", "Big slice, tiny price", "Golden breakfast", "Falafel feast", "Pad Thai after dark", "Cubano lunch club",
];

const descriptions = [
  "Fluffy buttermilk pancakes, eggs, and house coffee at a weekday-friendly price.",
  "Pick any six street tacos and get a second flight free. Dine-in only.",
  "Choose a curry, basmati rice, naan, and a cooling mango lassi.",
  "Any signature ramen bowl is half price during the last two hours of service.",
  "A generous spread of hummus, baba ganoush, tabbouleh, warm pita, and falafel.",
  "Our famous hot chicken sandwich with seasoned fries and iced tea.",
  "A steaming bowl of pho with your choice of protein plus fresh spring rolls.",
  "Build any grain bowl and add a cold-pressed juice on the house.",
  "House-made pasta, seasonal sauce, and a glass of wine or sparkling water.",
  "A sizzling bibimbap bowl with crispy rice and your favorite protein.",
  "Slow-smoked brisket, two sides, pickles, onions, and fresh white bread.",
  "A flaky butter croissant paired with any barista-made coffee.",
  "Six Gulf oysters with house mignonette during weekday happy hour.",
  "Two oversized slices and a fountain drink—the proper quick lunch.",
  "Avocado toast, soft egg, and any small coffee before the morning rush ends.",
  "Falafel wrap, za'atar fries, tahini slaw, and mint lemonade.",
  "A wok-fired Pad Thai plus mango sticky rice after 8 PM.",
  "Pressed Cubano, plantain chips, and a cafecito for your lunch break.",
];

const discounts = [25, 50, 30, 50, 35, 25, 30, 20, 40, 25, 30, 35, 40, 45, 25, 30, 35, 25];
const tags = ["breakfast", "lunch", "lunch", "dinner", "all day", "happy hour", "lunch", "all day", "dinner", "lunch", "lunch", "breakfast", "happy hour", "lunch", "breakfast", "all day", "dinner", "lunch"];
const photos = [
  "photo-1552566626-52f8b828add9", "photo-1555396273-367ea4eb4db5", "photo-1515003197210-e0cd71810b5f",
  "photo-1557872943-16a5ac26437e", "photo-1544148103-0773bf10d330", "photo-1514933651103-005eec06c04b",
];

const menuCategories = ["Breakfast", "Appetizers", "Mains", "Sides", "Desserts", "Drinks", "Alcohol"];

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.dealView.deleteMany();
  await prisma.dealRating.deleteMany();
  await prisma.redemption.deleteMany();
  await prisma.savedDeal.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.venueClaimRequest.deleteMany();
  await prisma.restaurant.deleteMany();

  const seededCategories = new Map<string, string>();
  for (const [sortOrder, name] of menuCategories.entries()) {
    const category = await prisma.menuCategory.upsert({ where: { name }, update: { sortOrder }, create: { name, sortOrder } });
    seededCategories.set(name, category.id);
  }

  const admin = await prisma.user.upsert({
    where: { email: "admin@bakunights.test" },
    update: { role: "ADMIN", passwordHash: await bcrypt.hash("admin1234", 12), emailVerifiedAt: new Date() },
    create: { email: "admin@bakunights.test", name: "BakuNights Admin", role: "ADMIN", passwordHash: await bcrypt.hash("admin1234", 12), emailVerifiedAt: new Date() },
  });
  await prisma.user.upsert({
    where: { email: "ops@bakunights.test" },
    update: { role: "ADMIN", passwordHash: await bcrypt.hash("admin1234", 12), emailVerifiedAt: new Date() },
    create: { email: "ops@bakunights.test", name: "BakuNights Ops", role: "ADMIN", passwordHash: await bcrypt.hash("admin1234", 12), emailVerifiedAt: new Date() },
  });
  const merchant = await prisma.user.upsert({
    where: { email: "merchant@grubstub.test" },
    update: { role: "MERCHANT", passwordHash: await bcrypt.hash("merchant123", 12), emailVerifiedAt: new Date() },
    create: { email: "merchant@grubstub.test", name: "Demo Merchant", role: "MERCHANT", passwordHash: await bcrypt.hash("merchant123", 12), emailVerifiedAt: new Date() },
  });
  await prisma.user.upsert({
    where: { email: "demo@grubstub.test" },
    update: { emailVerifiedAt: new Date() },
    create: { email: "demo@grubstub.test", name: "Deal Hunter", passwordHash: await bcrypt.hash("password123", 12), emailVerifiedAt: new Date(), homeLat: 30.2672, homeLng: -97.7431 },
  });

  const now = Date.now();
  for (let index = 0; index < restaurants.length; index += 1) {
    const [name, cuisine, address, lat, lng, rating, dietaryTags] = restaurants[index]!;
    const restaurant = await prisma.restaurant.create({ data: {
      name, cuisine, address: `${address}, Austin, TX`, lat, lng, rating,
      dietaryTags: [...dietaryTags], phone: `(512) 555-${String(1100 + index)}`,
      hoursJson: { Monday: "8:00 AM–10:00 PM", Tuesday: "8:00 AM–10:00 PM", Wednesday: "8:00 AM–10:00 PM", Thursday: "8:00 AM–10:00 PM", Friday: "8:00 AM–11:00 PM", Saturday: "9:00 AM–11:00 PM", Sunday: "9:00 AM–9:00 PM" },
      photoUrl: `https://images.unsplash.com/${photos[index % photos.length]}?auto=format&fit=crop&w=1200&q=80`,
      ownerUserId: index < 3 ? merchant.id : null,
      claimStatus: index < 3 ? "verified" : "unclaimed",
    } });
    if (index === 0) {
      await prisma.menuItem.createMany({ data: [
        { venueId: restaurant.id, categoryId: seededCategories.get("Breakfast")!, name: "Baku Breakfast", priceAzn: 14, description: "Eggs, cheese, olives, bread, and tea." },
        { venueId: restaurant.id, categoryId: seededCategories.get("Mains")!, name: "Lule Kebab", priceAzn: 12, description: "Charcoal-grilled kebab with onion and lavash." },
        { venueId: restaurant.id, categoryId: seededCategories.get("Drinks")!, name: "Azerbaijani Tea", priceAzn: 4, description: "Black tea served in an armudu glass." },
      ] });
    }
    await prisma.deal.create({ data: {
      restaurantId: restaurant.id,
      title: titles[index]!, description: descriptions[index]!, discountPct: discounts[index]!, tag: tags[index]!,
      dietaryTags: [...dietaryTags], startsAt: new Date(now - 60 * 60 * 1000),
      endsAt: new Date(now + ((index % 5) + 2) * 60 * 60 * 1000 + 2 * 24 * 60 * 60 * 1000),
      status: index < 3 ? "pending_review" : "approved",
      isActive: index >= 3,
      submittedByUserId: index < 3 ? merchant.id : admin.id,
      submittedAt: new Date(now - 60 * 60 * 1000),
      reviewedByUserId: index < 3 ? null : admin.id,
      reviewedAt: index < 3 ? null : new Date(now - 30 * 60 * 1000),
    } });
  }
  const unclaimedVenue = await prisma.restaurant.findFirst({ where: { ownerUserId: null } });
  if (unclaimedVenue) {
    await prisma.venueClaimRequest.create({
      data: {
        venueId: unclaimedVenue.id,
        requestingUserId: merchant.id,
        contactPhone: "+994 50 555 0101",
        contactEmail: "manager@example.test",
        proofNotes: "I manage this venue and can verify with business registration documents.",
      },
    });
    await prisma.restaurant.update({ where: { id: unclaimedVenue.id }, data: { claimStatus: "pending_verification" } });
  }
  console.log(`Seeded ${restaurants.length} venues, approved deals, pending deals, admins, and one claim request.`);
}

main().finally(() => prisma.$disconnect());
