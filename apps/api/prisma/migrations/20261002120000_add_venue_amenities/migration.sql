ALTER TABLE "restaurants"
ADD COLUMN "amenities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "price_level" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "restaurants"
ADD CONSTRAINT "restaurants_price_level_check" CHECK ("price_level" BETWEEN 1 AND 3);
