INSERT INTO "menu_categories" ("id", "name", "sort_order", "is_global") VALUES
  ('menu_cat_alcohol_general', 'Alcohol', 85, true),
  ('menu_cat_shots', 'Shots', 105, true)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order",
  "is_global" = true,
  "created_by_venue_id" = NULL;
