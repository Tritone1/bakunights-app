ALTER TABLE "deals"
ADD COLUMN "live_cycle" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "redemptions"
ADD COLUMN "deal_cycle" INTEGER NOT NULL DEFAULT 1;

-- A legacy offer that was already relaunched has a newer starts_at than its
-- previous customer claims. Move that active run to cycle 2 immediately so
-- customers do not need the merchant to relaunch it one more time.
UPDATE "deals" AS "deal"
SET "live_cycle" = 2
WHERE "deal"."is_active" = TRUE
  AND "deal"."status" = 'approved'
  AND EXISTS (
    SELECT 1
    FROM "redemptions" AS "redemption"
    WHERE "redemption"."deal_id" = "deal"."id"
      AND "redemption"."claimed_at" < "deal"."starts_at"
  );

-- Preserve any QR that was genuinely claimed after the latest relaunch.
UPDATE "redemptions" AS "redemption"
SET "deal_cycle" = 2
FROM "deals" AS "deal"
WHERE "redemption"."deal_id" = "deal"."id"
  AND "deal"."live_cycle" = 2
  AND "redemption"."claimed_at" >= "deal"."starts_at";

DROP INDEX "redemptions_user_id_deal_id_key";

CREATE UNIQUE INDEX "redemptions_user_id_deal_id_deal_cycle_key"
ON "redemptions"("user_id", "deal_id", "deal_cycle");
