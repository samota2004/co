ALTER TABLE "endpoint_devices" ADD COLUMN "ipCityEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "endpoint_devices" ADD COLUMN "ipCityGeneration" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "endpoint_devices" ADD COLUMN "ipCity" JSONB;
