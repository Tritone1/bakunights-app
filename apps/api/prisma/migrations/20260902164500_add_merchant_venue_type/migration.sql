ALTER TABLE "users"
ADD COLUMN "merchant_venue_type" TEXT;

ALTER TABLE "merchant_enrollment_requests"
ADD COLUMN "venue_type" TEXT NOT NULL DEFAULT 'Restaurant';
