CREATE TYPE "BackupEventType" AS ENUM ('ENROLLMENT_CREATED', 'PAYMENT_UPDATED', 'FULL_SYNC_REQUESTED');
CREATE TYPE "BackupEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'SYNCED', 'FAILED');
CREATE TYPE "BackupType" AS ENUM ('EXCEL', 'GOOGLE_SHEETS');
CREATE TYPE "BackupStatus" AS ENUM ('SUCCESS', 'FAILED');

CREATE TABLE "BackupEvent" (
    "id" UUID NOT NULL,
    "type" "BackupEventType" NOT NULL,
    "entityId" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "BackupEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    CONSTRAINT "BackupEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackupLog" (
    "id" UUID NOT NULL,
    "type" "BackupType" NOT NULL,
    "status" "BackupStatus" NOT NULL,
    "filename" VARCHAR(255),
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "initiatedBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BackupLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackupWorkerLock" (
    "id" INTEGER NOT NULL,
    "lockToken" UUID,
    "lockedUntil" TIMESTAMPTZ(3),
    CONSTRAINT "BackupWorkerLock_pkey" PRIMARY KEY ("id")
);
INSERT INTO "BackupWorkerLock" ("id") VALUES (1);

CREATE INDEX "BackupEvent_status_nextAttemptAt_createdAt_idx" ON "BackupEvent"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "BackupEvent_lockedUntil_idx" ON "BackupEvent"("lockedUntil");
CREATE INDEX "BackupLog_type_status_createdAt_idx" ON "BackupLog"("type", "status", "createdAt");
