CREATE TABLE "daily_spin_claims" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "spin_date" DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_spin_claims_pkey" PRIMARY KEY ("id")
);

-- Preserve every existing point award while recording one daily claim for dates
-- on which a customer may previously have completed multiple verified-visit spins.
INSERT INTO "daily_spin_claims" ("id", "user_id", "spin_date", "created_at")
SELECT
  'daily_' || "user_id" || ':' || "spin_date"::text,
  "user_id",
  "spin_date",
  MIN("created_at")
FROM "point_spins"
GROUP BY "user_id", "spin_date";

CREATE UNIQUE INDEX "daily_spin_claims_user_id_spin_date_key"
  ON "daily_spin_claims"("user_id", "spin_date");

ALTER TABLE "daily_spin_claims"
  ADD CONSTRAINT "daily_spin_claims_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
