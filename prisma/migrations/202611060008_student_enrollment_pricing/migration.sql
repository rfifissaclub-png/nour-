ALTER TYPE "BackupEventType" ADD VALUE 'ENROLLMENT_UPDATED';

ALTER TABLE "SubjectGroup"
ALTER COLUMN "monthlyPrice" SET DEFAULT 0;

ALTER TABLE "Enrollment"
ADD COLUMN "monthlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 0;

UPDATE "Enrollment" AS enrollment
SET "monthlyPrice" = group_record."monthlyPrice"
FROM "SubjectGroup" AS group_record
WHERE enrollment."groupId" = group_record."id";
