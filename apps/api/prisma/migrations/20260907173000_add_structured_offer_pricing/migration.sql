ALTER TABLE "deals"
  ADD COLUMN "offer_price_azn" DECIMAL(10,2),
  ADD COLUMN "minimum_spend_azn" DECIMAL(10,2),
  ADD COLUMN "free_menu_item_id" TEXT;

CREATE INDEX "deals_free_menu_item_id_idx" ON "deals"("free_menu_item_id");

ALTER TABLE "deals"
  ADD CONSTRAINT "deals_free_menu_item_id_fkey"
  FOREIGN KEY ("free_menu_item_id") REFERENCES "menu_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
