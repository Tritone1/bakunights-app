CREATE TABLE "point_spins" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "spin_date" DATE NOT NULL,
  "points" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "point_spins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "point_rewards" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "points_spent" INTEGER NOT NULL DEFAULT 500,
  "discount_pct" INTEGER NOT NULL DEFAULT 50,
  "max_bill_azn" DECIMAL(10,2) NOT NULL DEFAULT 200,
  "reward_code" TEXT NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "redeemed_at" TIMESTAMP(3),
  "redeemed_venue_id" TEXT,
  "bill_amount_azn" DECIMAL(10,2),
  "discount_amount_azn" DECIMAL(10,2),
  CONSTRAINT "point_rewards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "point_spins_user_id_spin_date_key" ON "point_spins"("user_id", "spin_date");
CREATE INDEX "point_spins_user_id_created_at_idx" ON "point_spins"("user_id", "created_at");
CREATE UNIQUE INDEX "point_rewards_reward_code_key" ON "point_rewards"("reward_code");
CREATE INDEX "point_rewards_user_id_redeemed_at_idx" ON "point_rewards"("user_id", "redeemed_at");
CREATE INDEX "point_rewards_redeemed_venue_id_redeemed_at_idx" ON "point_rewards"("redeemed_venue_id", "redeemed_at");

ALTER TABLE "point_spins" ADD CONSTRAINT "point_spins_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "point_rewards" ADD CONSTRAINT "point_rewards_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "point_rewards" ADD CONSTRAINT "point_rewards_redeemed_venue_id_fkey"
  FOREIGN KEY ("redeemed_venue_id") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
