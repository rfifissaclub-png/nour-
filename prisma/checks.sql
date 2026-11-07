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
