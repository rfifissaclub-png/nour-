-- CreateTable
CREATE TABLE "PaymentLine" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "levelId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "groupName" VARCHAR(150) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "teacherPercentage" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "PaymentLine_pkey" PRIMARY KEY ("id")
);

-- Backfill frozen group/teacher details for existing monthly invoices. Allocations
-- use group prices as weights, with any rounding remainder assigned to the last row.
WITH enrollment_rows AS (
    SELECT
        p."id" AS "paymentId",
        g."id" AS "groupId",
        g."levelId",
        g."teacherId",
        g."name" AS "groupName",
        g."monthlyPrice",
        g."teacherPercentage",
        p."totalAmount",
        ROW_NUMBER() OVER (PARTITION BY p."id" ORDER BY g."monthlyPrice" DESC, g."id") AS "rowNumber",
        COUNT(*) OVER (PARTITION BY p."id") AS "rowCount",
        SUM(g."monthlyPrice") OVER (PARTITION BY p."id") AS "priceTotal"
    FROM "Payment" p
    JOIN "Enrollment" e ON e."studentId" = p."studentId"
    JOIN "SubjectGroup" g ON g."id" = e."groupId"
),
weighted_rows AS (
    SELECT *,
        CASE WHEN "priceTotal" > 0 THEN "monthlyPrice" ELSE 1 END AS "weight",
        CASE WHEN "priceTotal" > 0 THEN "priceTotal" ELSE "rowCount" END AS "weightTotal"
    FROM enrollment_rows
),
rounded_rows AS (
    SELECT *,
        CASE WHEN "rowNumber" < "rowCount"
          THEN FLOOR(("totalAmount" * "weight" / NULLIF("weightTotal", 0)) * 100) / 100
          ELSE NULL
        END AS "roundedAmount"
    FROM weighted_rows
),
final_rows AS (
    SELECT *,
        CASE WHEN "rowNumber" < "rowCount"
          THEN "roundedAmount"
          ELSE "totalAmount" - SUM(COALESCE("roundedAmount", 0)) OVER (PARTITION BY "paymentId")
        END AS "lineAmount"
    FROM rounded_rows
)
INSERT INTO "PaymentLine" (
    "id", "paymentId", "groupId", "levelId", "teacherId", "groupName", "amount", "teacherPercentage"
)
SELECT
    gen_random_uuid(), "paymentId", "groupId", "levelId", "teacherId", "groupName", "lineAmount", "teacherPercentage"
FROM final_rows;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLine_paymentId_groupId_key" ON "PaymentLine"("paymentId", "groupId");

-- CreateIndex
CREATE INDEX "PaymentLine_teacherId_paymentId_idx" ON "PaymentLine"("teacherId", "paymentId");

-- CreateIndex
CREATE INDEX "PaymentLine_levelId_paymentId_idx" ON "PaymentLine"("levelId", "paymentId");

-- CreateIndex
CREATE INDEX "PaymentLine_groupId_idx" ON "PaymentLine"("groupId");

-- AddForeignKey
ALTER TABLE "PaymentLine" ADD CONSTRAINT "PaymentLine_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLine" ADD CONSTRAINT "PaymentLine_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SubjectGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLine" ADD CONSTRAINT "PaymentLine_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLine" ADD CONSTRAINT "PaymentLine_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentLine"
  ADD CONSTRAINT "payment_line_amount_nonnegative" CHECK ("amount" >= 0),
  ADD CONSTRAINT "payment_line_percentage_range" CHECK ("teacherPercentage" BETWEEN 0 AND 100);
