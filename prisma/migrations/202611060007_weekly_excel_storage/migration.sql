ALTER TABLE "BackupLog"
ADD COLUMN "storageKey" VARCHAR(512);

ALTER TABLE "BackupEvent"
ADD COLUMN "lockToken" UUID;
