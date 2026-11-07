import test from "node:test";
import assert from "node:assert/strict";
import {
  allocatePaymentLineCents,
  calculateTeacherShareCents,
  moneyToCents,
  sumMoneyCents,
} from "../src/lib/payments/finance";

test("monthly fees sum decimal group prices in cents", () => {
  assert.equal(sumMoneyCents(["150.25", "200.50", "0"]), 35075);
  assert.equal(moneyToCents("0.01"), 1);
});

test("partial collections are allocated proportionally to each billed group", () => {
  assert.deepEqual(allocatePaymentLineCents(6000, 10000, [3000, 7000]), [1800, 4200]);
  assert.deepEqual(allocatePaymentLineCents(0, 10000, [3000, 7000]), [0, 0]);
  assert.deepEqual(allocatePaymentLineCents(0, 0, [0, 0]), [0, 0]);
});

test("proportional payment allocation preserves every collected cent", () => {
  const lineShares = allocatePaymentLineCents(1, 3, [1, 1, 1]);
  assert.deepEqual(lineShares, [1, 0, 0]);
  assert.equal(lineShares.reduce((sum, share) => sum + share, 0), 1);
});

test("teacher commission is calculated only on collected group amounts", () => {
  const [allocated] = allocatePaymentLineCents(6000, 10000, [3000, 7000]);
  assert.equal(calculateTeacherShareCents(allocated, "60.00"), 1080);
  assert.equal(calculateTeacherShareCents(3000, 0), 0);
  assert.equal(calculateTeacherShareCents(3000, 100), 3000);
});

test("invalid or negative monetary input is rejected", () => {
  assert.throws(() => moneyToCents("-1"));
  assert.throws(() => calculateTeacherShareCents(100, 101));
  assert.throws(() => allocatePaymentLineCents(1.5, 200, [100, 100]));
  assert.throws(() => allocatePaymentLineCents(1, 3, [1, 1]));
});
