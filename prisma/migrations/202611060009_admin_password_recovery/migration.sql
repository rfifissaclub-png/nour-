CREATE TYPE "AdminRecoveryPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

ALTER TABLE "User"
ADD COLUMN "recoveryEmail" VARCHAR(254);

CREATE UNIQUE INDEX "User_recoveryEmail_key" ON "User"("recoveryEmail");

CREATE TABLE "AdminRecoveryChallenge" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "AdminRecoveryPurpose" NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminRecoveryChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminRecoveryChallenge_userId_purpose_key"
ON "AdminRecoveryChallenge"("userId", "purpose");

CREATE INDEX "AdminRecoveryChallenge_expiresAt_idx"
ON "AdminRecoveryChallenge"("expiresAt");

ALTER TABLE "AdminRecoveryChallenge"
ADD CONSTRAINT "AdminRecoveryChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
