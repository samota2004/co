ALTER TABLE "daily_risk_snapshots"
ADD COLUMN "riskAssessmentIds" JSONB NOT NULL DEFAULT '[]'::jsonb;
