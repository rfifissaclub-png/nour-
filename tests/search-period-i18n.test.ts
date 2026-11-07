import test from "node:test";
import assert from "node:assert/strict";
import { matchesSearch } from "../src/lib/search";
import { resolvePeriod, shiftPeriod } from "../src/lib/payments/period";
import { translate } from "../src/lib/i18n/translate";
test("search supports accents, reordered words, Arabic marks and Moroccan phones", () => {
  assert.ok(matchesSearch("elodie ben", "Ben Élodie"));
  assert.ok(matchesSearch("احمد", "أَحْمَد"));
  assert.ok(matchesSearch("06 12 34 56 78", "Élève", "+212612345678"));
  assert.ok(matchesSearch("٠٦١٢٣٤٥٦٧٨", "+212612345678"));
  assert.ok(matchesSearch("00212 612345678", "+212612345678"));
  assert.equal(matchesSearch("inconnu", "Élodie"), false);
});
test("billing months cross years and reject invalid or unsupported input", () => {
  assert.equal(shiftPeriod("2026-12", 1), "2027-01");
  assert.equal(shiftPeriod("2026-01", -1), "2025-12");
  assert.throws(() => shiftPeriod("2000-01", -1));
  assert.throws(() => shiftPeriod("9999-12", 1));
  const now = new Date("2026-10-31T23:30:00Z");
  assert.deepEqual(resolvePeriod("2025-03", now), { year: 2025, month: 3 });
  for (const invalid of ["0000-01", "2026-13", "x", undefined, ["2026-01"]]) {
    assert.deepEqual(resolvePeriod(invalid, now), { year: 2026, month: 11 });
  }
});
test("translations keep French intact and preserve names absent from the dictionary", () => {
  assert.equal(translate("fr", "Paiements"), "Paiements");
  assert.equal(translate("ar", "Paiements"), "الأداءات");
  assert.equal(translate("ar", "Élodie Benali"), "Élodie Benali");
});
