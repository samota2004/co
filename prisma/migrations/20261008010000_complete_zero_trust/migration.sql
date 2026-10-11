ALTER TYPE "DepartmentType" ADD VALUE IF NOT EXISTS 'MARKETING';
ALTER TYPE "DepartmentType" ADD VALUE IF NOT EXISTS 'ADMINISTRATION';
ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'RESTRICTED';
ALTER TYPE "EventSeverity" ADD VALUE IF NOT EXISTS 'VERY_HIGH';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'LOGIN';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'MODEL_ASSESSMENT';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'LOGOUT';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'FAILED_LOGIN';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'FILE_UPLOAD';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'USB_ACTIVITY';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'APPLICATION_ACCESS';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'APPLICATION_USAGE';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'RESOURCE_ACCESS';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'PRIVILEGE_CHANGE';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'PASSWORD_CHANGE';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'MFA_SUCCESS';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'MFA_FAILURE';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'CROSS_DEPARTMENT_ACCESS';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'SUSPICIOUS_DEVICE';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'UNUSUAL_LOCATION';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'SHELL_EXECUTION';
ALTER TYPE "IncidentStatus" ADD VALUE IF NOT EXISTS 'OPEN';
ALTER TYPE "IncidentStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';
ALTER TYPE "IncidentStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "IncidentStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TABLE "users" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "managerId" TEXT, ADD COLUMN "trustUpdatedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD CONSTRAINT "users_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "users_companyId_managerId_idx" ON "users"("companyId","managerId");
ALTER TABLE "behavior_profiles" ADD COLUMN "sampleDays" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "trainedThrough" TIMESTAMP(3), ADD COLUMN "statistics" JSONB;
ALTER TABLE "resources" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "resources" ADD COLUMN "protectedData" JSONB;
CREATE INDEX "resources_companyId_sensitivity_idx" ON "resources"("companyId","sensitivity");
ALTER TABLE "risk_scores" ADD COLUMN "sourceEventId" TEXT, ADD COLUMN "policyAction" TEXT;
CREATE UNIQUE INDEX "risk_scores_sourceEventId_key" ON "risk_scores"("sourceEventId");
ALTER TABLE "audit_logs" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'legacy';
UPDATE "audit_logs" a SET "companyId"=u."companyId" FROM "users" u WHERE a."userId"=u."id";
CREATE INDEX "audit_logs_companyId_timestamp_idx" ON "audit_logs"("companyId","timestamp");
ALTER TABLE "zero_trust_policies" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'legacy', ADD COLUMN "config" JSONB;
-- Existing installations may have multiple historical policies. Retain every
-- row. Only the most recent gets the shared company policy key.
UPDATE "zero_trust_policies" SET "companyId"='historical-policy:'||"id" WHERE "id" NOT IN
 (SELECT "id" FROM "zero_trust_policies" ORDER BY "updatedAt" DESC LIMIT 1);
CREATE UNIQUE INDEX "zero_trust_policies_companyId_key" ON "zero_trust_policies"("companyId");
ALTER TABLE "sessions" ADD COLUMN "refreshHash" TEXT, ADD COLUMN "revokedAt" TIMESTAMP(3), ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "sessions_refreshHash_key" ON "sessions"("refreshHash");
