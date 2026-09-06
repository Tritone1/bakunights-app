ALTER TABLE "deals"
ADD COLUMN "source_language" TEXT,
ADD COLUMN "translations" JSONB;
