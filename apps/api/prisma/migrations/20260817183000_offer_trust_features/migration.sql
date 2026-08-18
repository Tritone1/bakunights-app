CREATE TYPE "VenueFlagStatus" AS ENUM ('OPEN', 'RESOLVED');

ALTER TABLE "restaurants"
  ADD COLUMN "is_verified_trusted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trusted_badge_revoked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "honesty_rate" DOUBLE PRECISION;

ALTER TABLE "deals" ADD COLUMN "photo_url" TEXT;
ALTER TABLE "redemptions" ADD COLUMN "feedback_skipped_at" TIMESTAMP(3);

CREATE TABLE "redemption_feedback" (
  "id" TEXT NOT NULL,
  "redemption_id" TEXT NOT NULL,
  "was_honored" BOOLEAN NOT NULL,
  "comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "redemption_feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_trust_flags" (
  "id" TEXT NOT NULL,
  "venue_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "VenueFlagStatus" NOT NULL DEFAULT 'OPEN',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "resolved_by_user_id" TEXT,
  CONSTRAINT "venue_trust_flags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "redemption_feedback_redemption_id_key" ON "redemption_feedback"("redemption_id");
CREATE INDEX "redemption_feedback_created_at_idx" ON "redemption_feedback"("created_at");
CREATE INDEX "venue_trust_flags_status_created_at_idx" ON "venue_trust_flags"("status", "created_at");
CREATE INDEX "venue_trust_flags_venue_id_status_idx" ON "venue_trust_flags"("venue_id", "status");

ALTER TABLE "redemption_feedback" ADD CONSTRAINT "redemption_feedback_redemption_id_fkey"
  FOREIGN KEY ("redemption_id") REFERENCES "redemptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_trust_flags" ADD CONSTRAINT "venue_trust_flags_venue_id_fkey"
  FOREIGN KEY ("venue_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
