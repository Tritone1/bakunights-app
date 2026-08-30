ALTER TABLE "point_spins"
  ADD COLUMN "redemption_id" TEXT;

DROP INDEX "point_spins_user_id_spin_date_key";

CREATE UNIQUE INDEX "point_spins_redemption_id_key" ON "point_spins"("redemption_id");

ALTER TABLE "point_spins"
  ADD CONSTRAINT "point_spins_redemption_id_fkey"
  FOREIGN KEY ("redemption_id") REFERENCES "redemptions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
