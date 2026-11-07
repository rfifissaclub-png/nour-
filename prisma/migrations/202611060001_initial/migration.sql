-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PARTIAL', 'UNPAID');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('COURSE', 'EXERCISE', 'EXAM');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "codeId" VARCHAR(32) NOT NULL,
    "fullName" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(32),
    "pin" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Level" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "Level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectGroup" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "monthlyPrice" DECIMAL(10,2) NOT NULL,
    "teacherPercentage" DECIMAL(5,2) NOT NULL,
    "levelId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,

    CONSTRAINT "SubjectGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "month" SMALLINT NOT NULL,
    "year" SMALLINT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMPTZ(3),
    "note" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "type" "ResourceType" NOT NULL,
    "fileUrl" TEXT,
    "externalLink" TEXT,
    "groupId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_codeId_key" ON "User"("codeId");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Level_name_key" ON "Level"("name");

-- CreateIndex
CREATE INDEX "SubjectGroup_teacherId_idx" ON "SubjectGroup"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectGroup_levelId_name_key" ON "SubjectGroup"("levelId", "name");

-- CreateIndex
CREATE INDEX "Enrollment_groupId_idx" ON "Enrollment"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_studentId_groupId_key" ON "Enrollment"("studentId", "groupId");

-- CreateIndex
CREATE INDEX "Payment_year_month_status_idx" ON "Payment"("year", "month", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_studentId_month_year_key" ON "Payment"("studentId", "month", "year");

-- CreateIndex
CREATE INDEX "Resource_groupId_type_createdAt_idx" ON "Resource"("groupId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Resource_teacherId_idx" ON "Resource"("teacherId");

-- AddForeignKey
ALTER TABLE "SubjectGroup" ADD CONSTRAINT "SubjectGroup_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectGroup" ADD CONSTRAINT "SubjectGroup_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SubjectGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SubjectGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubjectGroup"
  ADD CONSTRAINT "group_price_nonnegative" CHECK ("monthlyPrice" >= 0),
  ADD CONSTRAINT "group_percentage_range" CHECK ("teacherPercentage" BETWEEN 0 AND 100);

ALTER TABLE "Payment"
  ADD CONSTRAINT "payment_month_range" CHECK ("month" BETWEEN 1 AND 12),
  ADD CONSTRAINT "payment_year_range" CHECK ("year" BETWEEN 2000 AND 9999),
  ADD CONSTRAINT "payment_amounts_valid" CHECK (
    "totalAmount" >= 0 AND "paidAmount" >= 0 AND "paidAmount" <= "totalAmount"
  ),
  ADD CONSTRAINT "payment_status_consistent" CHECK (
    ("status" = 'UNPAID' AND "paidAmount" = 0 AND "totalAmount" > 0) OR
    ("status" = 'PARTIAL' AND "paidAmount" > 0 AND "paidAmount" < "totalAmount") OR
    ("status" = 'PAID' AND "paidAmount" = "totalAmount")
  ),
  ADD CONSTRAINT "payment_date_consistent" CHECK (
    ("paidAmount" = 0 AND "paidAt" IS NULL) OR
    ("paidAmount" > 0 AND "paidAt" IS NOT NULL)
  );

ALTER TABLE "Resource"
  ADD CONSTRAINT "resource_has_source" CHECK (
    NULLIF(BTRIM("fileUrl"), '') IS NOT NULL OR
    NULLIF(BTRIM("externalLink"), '') IS NOT NULL
  );
