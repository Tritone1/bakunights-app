DROP INDEX "redemptions_user_id_deal_id_deal_cycle_key";

-- A customer may use the same live deal repeatedly, but may only have one
-- unredeemed QR for that deal at a time.
CREATE UNIQUE INDEX "redemptions_one_pending_per_user_deal_cycle_key"
  ON "redemptions"("user_id", "deal_id", "deal_cycle")
  WHERE "redeemed_at" IS NULL;

CREATE INDEX "redemptions_user_id_deal_id_deal_cycle_claimed_at_idx"
  ON "redemptions"("user_id", "deal_id", "deal_cycle", "claimed_at");

CREATE INDEX "redemptions_user_id_redeemed_at_idx"
  ON "redemptions"("user_id", "redeemed_at");
