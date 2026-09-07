CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "firstName" TEXT NOT NULL, "passwordHash" TEXT NOT NULL);
CREATE TABLE "Outlet" ("id" TEXT PRIMARY KEY, "level" INTEGER NOT NULL, "location" TEXT NOT NULL, "label" TEXT NOT NULL, "note" TEXT, "sortOrder" INTEGER NOT NULL UNIQUE);
CREATE TABLE "Inspection" ("id" TEXT PRIMARY KEY, "inspectorName" TEXT NOT NULL, "performedOn" DATE NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "userId" TEXT NOT NULL REFERENCES "User"("id"));
CREATE TABLE "Reading" ("id" TEXT PRIMARY KEY, "inspectionId" TEXT NOT NULL REFERENCES "Inspection"("id"), "outletId" TEXT NOT NULL REFERENCES "Outlet"("id"), "current" INTEGER NOT NULL CHECK ("current" >= 0), "previous" INTEGER, "previousDate" DATE, UNIQUE("inspectionId", "outletId"));
CREATE INDEX "Inspection_performedOn_createdAt_idx" ON "Inspection"("performedOn", "createdAt");
