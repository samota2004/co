CREATE TABLE "daily_risk_snapshots" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "riskScore" DOUBLE PRECISION,
  "riskLevel" "EventSeverity",
  "trustScore" DOUBLE PRECISION,
  "trustAsOf" TIMESTAMPTZ,
  "monitoringStatus" TEXT NOT NULL,
  "riskFactors" JSONB NOT NULL,
  "securityEventIds" JSONB NOT NULL,
  "incidentIds" JSONB NOT NULL,
  "sourceCounts" JSONB NOT NULL,
  "finalized" BOOLEAN NOT NULL DEFAULT false,
  "finalizedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "daily_risk_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_risk_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "daily_risk_snapshots_userId_day_key" ON "daily_risk_snapshots"("userId", "day");
CREATE INDEX "daily_risk_snapshots_companyId_day_idx" ON "daily_risk_snapshots"("companyId", "day");
CREATE INDEX "daily_risk_snapshots_userId_day_idx" ON "daily_risk_snapshots"("userId", "day");

CREATE TABLE "security_notifications" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "targetUserId" TEXT,
  "incidentId" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" "EventSeverity" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "readAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "security_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "security_notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "security_notifications_recipientId_dedupeKey_key" ON "security_notifications"("recipientId", "dedupeKey");
CREATE INDEX "security_notifications_companyId_recipientId_createdAt_idx" ON "security_notifications"("companyId", "recipientId", "createdAt");
CREATE INDEX "security_notifications_recipientId_readAt_createdAt_idx" ON "security_notifications"("recipientId", "readAt", "createdAt");

CREATE TABLE "endpoint_enforcement_commands" (
  "id" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "resultCode" TEXT,
  "reason" TEXT NOT NULL,
  "issuedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMPTZ,
  "createdById" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "endpoint_enforcement_commands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "endpoint_enforcement_commands_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "endpoint_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "endpoint_enforcement_commands_commandId_key" ON "endpoint_enforcement_commands"("commandId");
CREATE INDEX "endpoint_enforcement_commands_companyId_userId_createdAt_idx" ON "endpoint_enforcement_commands"("companyId", "userId", "createdAt");
CREATE INDEX "endpoint_enforcement_commands_deviceId_status_createdAt_idx" ON "endpoint_enforcement_commands"("deviceId", "status", "createdAt");
