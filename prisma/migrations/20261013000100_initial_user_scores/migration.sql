-- Registration baseline only. Preserve all existing scores and security history.
ALTER TABLE "users" ALTER COLUMN "riskScore" SET DEFAULT 0;
ALTER TABLE "users" ALTER COLUMN "trustScore" SET DEFAULT 100;
