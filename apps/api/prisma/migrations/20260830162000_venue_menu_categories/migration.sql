ALTER TABLE "menu_categories"
  ADD COLUMN "is_global" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "created_by_venue_id" TEXT;

DROP INDEX IF EXISTS "menu_categories_name_key";
DROP INDEX IF EXISTS "menu_categories_sort_order_idx";

ALTER TABLE "menu_categories"
  ADD CONSTRAINT "menu_categories_created_by_venue_id_fkey"
  FOREIGN KEY ("created_by_venue_id") REFERENCES "restaurants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_categories"
  ADD CONSTRAINT "menu_categories_scope_check"
  CHECK ("is_global" OR "created_by_venue_id" IS NOT NULL);

CREATE INDEX "menu_categories_is_global_sort_order_idx"
  ON "menu_categories"("is_global", "sort_order");
CREATE INDEX "menu_categories_created_by_venue_id_idx"
  ON "menu_categories"("created_by_venue_id");

CREATE TABLE "venue_menu_categories" (
  "venue_id" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "venue_menu_categories_pkey" PRIMARY KEY ("venue_id", "category_id")
);

CREATE INDEX "venue_menu_categories_category_id_idx"
  ON "venue_menu_categories"("category_id");
CREATE INDEX "venue_menu_categories_venue_id_sort_order_idx"
  ON "venue_menu_categories"("venue_id", "sort_order");

ALTER TABLE "venue_menu_categories"
  ADD CONSTRAINT "venue_menu_categories_venue_id_fkey"
  FOREIGN KEY ("venue_id") REFERENCES "restaurants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_menu_categories"
  ADD CONSTRAINT "venue_menu_categories_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Broaden the shared taxonomy while preserving IDs already referenced by menu items.
UPDATE "menu_categories" SET "name" = 'Breakfast', "sort_order" = 0, "is_global" = true WHERE "id" = 'menu_cat_breakfast';
UPDATE "menu_categories" SET "name" = 'Starters', "sort_order" = 10, "is_global" = true WHERE "id" = 'menu_cat_appetizers';
UPDATE "menu_categories" SET "name" = 'Mains', "sort_order" = 40, "is_global" = true WHERE "id" = 'menu_cat_mains';
UPDATE "menu_categories" SET "name" = 'Sides', "sort_order" = 50, "is_global" = true WHERE "id" = 'menu_cat_sides';
UPDATE "menu_categories" SET "name" = 'Desserts', "sort_order" = 60, "is_global" = true WHERE "id" = 'menu_cat_desserts';
UPDATE "menu_categories" SET "name" = 'Soft Drinks', "sort_order" = 70, "is_global" = true WHERE "id" = 'menu_cat_drinks';
UPDATE "menu_categories" SET "name" = 'Beer & Wine', "sort_order" = 90, "is_global" = true WHERE "id" = 'menu_cat_alcohol';

INSERT INTO "menu_categories" ("id", "name", "sort_order", "is_global") VALUES
  ('menu_cat_soups', 'Soups', 20, true),
  ('menu_cat_salads', 'Salads', 30, true),
  ('menu_cat_mocktails', 'Non-Alcoholic Cocktails', 80, true),
  ('menu_cat_cocktails', 'Cocktails & Spirits', 100, true),
  ('menu_cat_shisha', 'Shisha', 110, true),
  ('menu_cat_combos', 'Combos & Sets', 120, true)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order",
  "is_global" = true,
  "created_by_venue_id" = NULL;

-- Existing menu items automatically enable their category for that venue.
INSERT INTO "venue_menu_categories" ("venue_id", "category_id", "sort_order")
SELECT DISTINCT mi."venue_id", mi."category_id", mc."sort_order"
FROM "menu_items" mi
JOIN "menu_categories" mc ON mc."id" = mi."category_id"
ON CONFLICT ("venue_id", "category_id") DO NOTHING;

-- Preserve existing category-scoped offers even if their venue currently has no menu item row.
INSERT INTO "venue_menu_categories" ("venue_id", "category_id", "sort_order")
SELECT DISTINCT d."restaurant_id", d."scope_category_id", mc."sort_order"
FROM "deals" d
JOIN "menu_categories" mc ON mc."id" = d."scope_category_id"
WHERE d."scope_category_id" IS NOT NULL
ON CONFLICT ("venue_id", "category_id") DO NOTHING;
