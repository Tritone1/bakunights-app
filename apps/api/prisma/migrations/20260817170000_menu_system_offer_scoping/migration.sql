CREATE TYPE "OfferScope" AS ENUM ('WHOLE_MENU', 'CATEGORY', 'SPECIFIC_ITEMS');

CREATE TABLE "menu_categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "menu_items" (
  "id" TEXT NOT NULL,
  "venue_id" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "price_azn" DECIMAL(10,2) NOT NULL,
  "description" TEXT,
  "photo_url" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offer_menu_items" (
  "offer_id" TEXT NOT NULL,
  "menu_item_id" TEXT NOT NULL,
  "override_price_azn" DECIMAL(10,2),
  CONSTRAINT "offer_menu_items_pkey" PRIMARY KEY ("offer_id", "menu_item_id")
);

ALTER TABLE "deals" ADD COLUMN "scope" "OfferScope" NOT NULL DEFAULT 'WHOLE_MENU';
ALTER TABLE "deals" ADD COLUMN "scope_category_id" TEXT;

CREATE UNIQUE INDEX "menu_categories_name_key" ON "menu_categories"("name");
CREATE INDEX "menu_categories_sort_order_idx" ON "menu_categories"("sort_order");
CREATE INDEX "menu_items_venue_id_category_id_is_active_idx" ON "menu_items"("venue_id", "category_id", "is_active");

ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offer_menu_items" ADD CONSTRAINT "offer_menu_items_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offer_menu_items" ADD CONSTRAINT "offer_menu_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_scope_category_id_fkey" FOREIGN KEY ("scope_category_id") REFERENCES "menu_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "menu_categories" ("id", "name", "sort_order") VALUES
  ('menu_cat_breakfast', 'Breakfast', 0),
  ('menu_cat_appetizers', 'Appetizers', 1),
  ('menu_cat_mains', 'Mains', 2),
  ('menu_cat_sides', 'Sides', 3),
  ('menu_cat_desserts', 'Desserts', 4),
  ('menu_cat_drinks', 'Drinks', 5),
  ('menu_cat_alcohol', 'Alcohol', 6);
