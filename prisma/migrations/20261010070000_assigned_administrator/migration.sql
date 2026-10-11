ALTER TABLE "users" ADD COLUMN "assignedAdminId" TEXT;
ALTER TABLE "users" ADD CONSTRAINT "users_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "users_companyId_assignedAdminId_idx" ON "users"("companyId", "assignedAdminId");
