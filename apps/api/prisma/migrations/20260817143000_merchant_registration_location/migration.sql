ALTER TABLE "users"
  ADD COLUMN "merchant_venue_address" TEXT,
  ADD COLUMN "merchant_venue_lat" DOUBLE PRECISION,
  ADD COLUMN "merchant_venue_lng" DOUBLE PRECISION;
