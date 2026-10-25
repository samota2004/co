ALTER TABLE "endpoint_enforcement_commands"
ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "endpoint_enforcement_commands_deviceId_status_expiresAt_idx"
ON "endpoint_enforcement_commands"("deviceId", "status", "expiresAt");
