CREATE TABLE "merchant_enrollment_requests" (
    "id" TEXT NOT NULL,
    "requesting_user_id" TEXT NOT NULL,
    "venue_name" TEXT NOT NULL,
    "venue_address" TEXT NOT NULL,
    "venue_lat" DOUBLE PRECISION NOT NULL,
    "venue_lng" DOUBLE PRECISION NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "proof_notes" TEXT NOT NULL,
    "status" "ClaimRequestStatus" NOT NULL DEFAULT 'pending',
    "review_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "merchant_enrollment_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "merchant_enrollment_requests_requesting_user_id_key"
ON "merchant_enrollment_requests"("requesting_user_id");

CREATE INDEX "merchant_enrollment_requests_status_created_at_idx"
ON "merchant_enrollment_requests"("status", "created_at");

ALTER TABLE "merchant_enrollment_requests"
ADD CONSTRAINT "merchant_enrollment_requests_requesting_user_id_fkey"
FOREIGN KEY ("requesting_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
