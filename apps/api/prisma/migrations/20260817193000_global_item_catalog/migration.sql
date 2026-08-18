CREATE TABLE "catalog_items" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "photo_url" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalog_items_name_key" ON "catalog_items"("name");
CREATE INDEX "catalog_items_category_id_is_active_idx" ON "catalog_items"("category_id", "is_active");
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "catalog_items" ("id", "name", "category_id") VALUES
  ('catalog_coca_cola_330', 'Coca-Cola 330ml', 'menu_cat_drinks'),
  ('catalog_heineken_500', 'Heineken 500ml', 'menu_cat_alcohol'),
  ('catalog_nescafe', 'Nescafé', 'menu_cat_drinks');
