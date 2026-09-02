import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const categories = [
  ["menu_cat_breakfast", "Breakfast", 0],
  ["menu_cat_appetizers", "Starters", 10],
  ["menu_cat_soups", "Soups", 20],
  ["menu_cat_salads", "Salads", 30],
  ["menu_cat_mains", "Mains", 40],
  ["menu_cat_sides", "Sides", 50],
  ["menu_cat_desserts", "Desserts", 60],
  ["menu_cat_drinks", "Soft Drinks", 70],
  ["menu_cat_mocktails", "Non-Alcoholic Cocktails", 80],
  ["menu_cat_alcohol_general", "Alcohol", 85],
  ["menu_cat_alcohol", "Beer & Wine", 90],
  ["menu_cat_cocktails", "Cocktails & Spirits", 100],
  ["menu_cat_shots", "Shots", 105],
  ["menu_cat_shisha", "Shisha", 110],
  ["menu_cat_combos", "Combos & Sets", 120],
] as const;

async function main() {
  for (const [id, name, sortOrder] of categories) {
    await prisma.menuCategory.upsert({
      where: { id },
      create: { id, name, sortOrder, isGlobal: true },
      update: { name, sortOrder, isGlobal: true, createdByVenueId: null },
    });
  }

  const restaurant = await prisma.restaurant.upsert({
    where: { id: "seed_venue_restaurant_sections" },
    create: {
      id: "seed_venue_restaurant_sections",
      name: "Seed Dining Room",
      cuisine: "Restaurant",
      address: "Development seed · Baku",
      lat: 40.4093,
      lng: 49.8671,
      isActive: true,
    },
    update: {},
  });
  const lounge = await prisma.restaurant.upsert({
    where: { id: "seed_venue_lounge_sections" },
    create: {
      id: "seed_venue_lounge_sections",
      name: "Seed Shisha Lounge",
      cuisine: "Shisha lounge",
      address: "Development seed · Baku",
      lat: 40.3777,
      lng: 49.892,
      isActive: true,
    },
    update: {},
  });

  await prisma.venueMenuCategory.deleteMany({ where: { venueId: { in: [restaurant.id, lounge.id] } } });
  await prisma.venueMenuCategory.createMany({
    data: [
      "menu_cat_appetizers", "menu_cat_soups", "menu_cat_salads", "menu_cat_mains", "menu_cat_sides", "menu_cat_desserts",
    ].map((categoryId, sortOrder) => ({ venueId: restaurant.id, categoryId, sortOrder })),
  });
  await prisma.venueMenuCategory.createMany({
    data: [
      "menu_cat_shisha", "menu_cat_drinks", "menu_cat_mocktails", "menu_cat_alcohol", "menu_cat_cocktails", "menu_cat_combos",
    ].map((categoryId, sortOrder) => ({ venueId: lounge.id, categoryId, sortOrder })),
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
