CREATE TABLE "WeeklyReport" (
    "id" TEXT PRIMARY KEY,
    "weekStart" DATE NOT NULL UNIQUE,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT REFERENCES "User"("id")
);

CREATE TABLE "WeeklyReading" (
    "id" TEXT PRIMARY KEY,
    "reportId" TEXT NOT NULL REFERENCES "WeeklyReport"("id") ON DELETE CASCADE,
    "outletId" TEXT NOT NULL REFERENCES "Outlet"("id"),
    "current" INTEGER CHECK ("current" >= 0),
    "version" INTEGER NOT NULL DEFAULT 1,
    "inspectorName" TEXT NOT NULL,
    "recordedOn" DATE NOT NULL,
    "recordedById" TEXT NOT NULL REFERENCES "User"("id"),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("reportId", "outletId")
);
CREATE INDEX "WeeklyReading_outletId_idx" ON "WeeklyReading"("outletId");

CREATE TABLE "ReportActivity" (
    "id" TEXT PRIMARY KEY,
    "reportId" TEXT NOT NULL REFERENCES "WeeklyReport"("id") ON DELETE CASCADE,
    "userId" TEXT NOT NULL REFERENCES "User"("id"),
    "inspectorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ReportActivity_reportId_createdAt_idx"
    ON "ReportActivity"("reportId", "createdAt");

-- Keep every legacy inspection and reading unchanged as an archive. Their
-- newest reading for each station becomes the shared draft for that week.
INSERT INTO "WeeklyReport" (
    "id", "weekStart", "version", "createdAt", "updatedAt"
)
SELECT
    'week-' || to_char(date_trunc('week', "performedOn"), 'YYYY-MM-DD'),
    date_trunc('week', "performedOn")::date,
    count(*)::integer,
    min("createdAt"),
    max("createdAt")
FROM "Inspection"
GROUP BY date_trunc('week', "performedOn");

WITH ranked_readings AS (
    SELECT
        reading.*,
        inspection."inspectorName",
        inspection."performedOn",
        inspection."userId",
        inspection."createdAt",
        date_trunc('week', inspection."performedOn") AS week_start,
        row_number() OVER (
            PARTITION BY date_trunc('week', inspection."performedOn"), reading."outletId"
            ORDER BY inspection."performedOn" DESC,
                     inspection."createdAt" DESC,
                     inspection."id" DESC
        ) AS priority
    FROM "Reading" reading
    JOIN "Inspection" inspection ON inspection."id" = reading."inspectionId"
)
INSERT INTO "WeeklyReading" (
    "id", "reportId", "outletId", "current", "inspectorName",
    "recordedOn", "recordedById", "updatedAt"
)
SELECT
    'weekly-' || "id",
    'week-' || to_char(week_start, 'YYYY-MM-DD'),
    "outletId", "current", "inspectorName", "performedOn", "userId", "createdAt"
FROM ranked_readings
WHERE priority = 1;

INSERT INTO "ReportActivity" (
    "id", "reportId", "userId", "inspectorName", "action", "changes", "createdAt"
)
SELECT
    'legacy-' || inspection."id",
    'week-' || to_char(date_trunc('week', inspection."performedOn"), 'YYYY-MM-DD'),
    inspection."userId",
    inspection."inspectorName",
    'import',
    COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'outletId', reading."outletId",
            'current', reading."current",
            'previous', reading."previous",
            'previousDate', reading."previousDate"
        ))
        FROM "Reading" reading
        WHERE reading."inspectionId" = inspection."id"
    ), '[]'::jsonb),
    inspection."createdAt"
FROM "Inspection" inspection;
