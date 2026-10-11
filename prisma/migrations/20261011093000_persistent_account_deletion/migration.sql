ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3);
-- Only convert disabled accounts with a recorded Delete action. An account
-- marked inactive through Edit remains an ordinary disabled account.
UPDATE "users" u SET "deletedAt" = CURRENT_TIMESTAMP
WHERE u.status = 'DISABLED' AND u."isMainAdmin" = false AND EXISTS (
 SELECT 1 FROM "audit_logs" a WHERE a."companyId" = u."companyId" AND (
  (a.action = 'ACCOUNT_RESTRICTED' AND a."userId" = u.id AND a.metadata->>'status' = 'DISABLED') OR
  (a.action = 'ADMIN_DISABLED' AND a.metadata->>'id' = u.id)
 )
);
UPDATE "users" SET "managerId" = NULL WHERE "managerId" IN (SELECT id FROM "users" WHERE "deletedAt" IS NOT NULL);
UPDATE "users" SET "assignedAdminId" = NULL WHERE "assignedAdminId" IN (SELECT id FROM "users" WHERE "deletedAt" IS NOT NULL);
