ALTER TABLE "users" ADD COLUMN "companyId" TEXT NOT NULL DEFAULT 'legacy';
CREATE TABLE "endpoint_devices" (
 "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
 "name" TEXT NOT NULL, "platform" TEXT NOT NULL, "mappedIdentity" TEXT,
 "credentialHash" TEXT UNIQUE, "enrollmentHash" TEXT UNIQUE, "enrollmentExpiresAt" TIMESTAMP(3),
 "enrolledAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3), "lastSeen" TIMESTAMP(3),
 "agentVersion" TEXT, "health" JSONB, "config" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "endpoint_devices_companyId_userId_idx" ON "endpoint_devices"("companyId", "userId");
CREATE TABLE "endpoint_events" (
 "id" TEXT PRIMARY KEY, "eventId" TEXT NOT NULL, "deviceId" TEXT NOT NULL REFERENCES "endpoint_devices"("id") ON DELETE RESTRICT,
 "companyId" TEXT NOT NULL, "userId" TEXT, "version" INTEGER NOT NULL, "type" TEXT NOT NULL,
 "occurredAt" TIMESTAMP(3) NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "metadata" JSONB NOT NULL
);
CREATE UNIQUE INDEX "endpoint_events_deviceId_eventId_key" ON "endpoint_events"("deviceId", "eventId");
CREATE INDEX "endpoint_events_companyId_userId_occurredAt_idx" ON "endpoint_events"("companyId", "userId", "occurredAt");
