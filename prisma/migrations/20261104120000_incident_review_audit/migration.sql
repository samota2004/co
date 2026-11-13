ALTER TABLE "incidents" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "incidents" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "incidents" ADD COLUMN "reviewedBy" TEXT;
ALTER TABLE "incidents" ADD COLUMN "reviewOutcome" TEXT;
ALTER TABLE "incidents" ADD COLUMN "reviewNotes" TEXT;

UPDATE "incidents" AS i
SET "companyId" = u."companyId"
FROM "users" AS u
WHERE i."userId" = u."id";

CREATE INDEX "incidents_companyId_status_idx" ON "incidents"("companyId", "status");
