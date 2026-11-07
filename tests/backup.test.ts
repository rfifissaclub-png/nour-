import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import "fake-indexeddb/auto";
import { buildMonthlyPaymentStatus, levelMonthAmounts, schoolYearMonths, type BackupStudent } from "../src/lib/backup/calculations";
import { isPermanentBackupError, MAX_BACKUP_EVENT_ATTEMPTS, retryDelaySeconds } from "../src/lib/backup/retry";
import { findStudentRowIndex } from "../src/lib/backup/google-row";
import { clearAllBackupCache, readBackupCache, writeBackupCache } from "../src/lib/backup/offline-cache";
import { formatDirhams, sanitizeWorksheetTitle } from "../src/lib/backup/google-sheet-utils";

test("school year runs September through June using Morocco period years", () => {
  assert.deepEqual(schoolYearMonths(2026).map(item => [item.year, item.month]), [
    [2026, 9], [2026, 10], [2026, 11], [2026, 12], [2027, 1],
    [2027, 2], [2027, 3], [2027, 4], [2027, 5], [2027, 6],
  ]);
});

test("monthly status distinguishes unpaid, advance, partial, paid, and surplus", () => {
  assert.equal(buildMonthlyPaymentStatus(0, 30000), "❌ NON PAYÉ");
  assert.equal(buildMonthlyPaymentStatus(10000, 30000), "⚠️ AVANCE (Reste 200 DH)");
  assert.equal(buildMonthlyPaymentStatus(15000, 30000), "⚠️ PARTIEL (150 DH / 300 DH)");
  assert.equal(buildMonthlyPaymentStatus(30000, 30000), "✅ PAYÉ (300 DH)");
  assert.equal(buildMonthlyPaymentStatus(35050, 30000), "✅ PAYÉ (350.5 DH) · SURPLUS 50.5 DH");
});

test("Google worksheet titles are sanitized, length-limited, and disambiguated by stable level IDs", () => {
  const first = sanitizeWorksheetTitle("  2Bac [PC] / Sciences  ", "11111111-2222-3333-4444-555555555555");
  const second = sanitizeWorksheetTitle("2Bac [PC] / Sciences", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  assert.equal(first.length <= 100, true);
  assert.equal(first.includes("[") || first.includes("]") || first.includes("/"), false);
  assert.notEqual(first, second);
  assert.match(sanitizeWorksheetTitle("Tronc Commun").trim(), /^Tronc Commun/);
  assert.equal(formatDirhams(30000), "300 DH");
  assert.equal(formatDirhams(15050), "150.5 DH");
});

test("level payment allocation is derived from frozen invoice lines", () => {
  const student: BackupStudent = {
    id: "student",
    codeId: "NOUR-1042",
    fullName: "Élève test",
    phone: null,
    groups: [
      { id: "group-a", name: "Math", levelId: "level-a", levelName: "1 Bac", monthlyPrice: "200.00" },
      { id: "group-b", name: "Physique", levelId: "level-b", levelName: "2 Bac", monthlyPrice: "100.00" },
    ],
    payments: [{
      id: "payment",
      year: 2026,
      month: 10,
      totalAmount: "300.00",
      paidAmount: "150.00",
      status: "PARTIAL",
      lines: [{ levelId: "level-a", amount: "200.00" }, { levelId: "level-b", amount: "100.00" }],
    }],
  };
  assert.deepEqual(levelMonthAmounts(student, 2026, 10, "level-a"), {
    expectedCents: 20000, paidCents: 10000, totalExpectedCents: 30000, totalPaidCents: 15000,
  });
  assert.deepEqual(levelMonthAmounts(student, 2026, 10, "level-b"), {
    expectedCents: 10000, paidCents: 5000, totalExpectedCents: 30000, totalPaidCents: 15000,
  });
});

test("backup worker retry uses bounded exponential backoff", () => {
  assert.equal(retryDelaySeconds(1), 30);
  assert.equal(retryDelaySeconds(2), 60);
  assert.equal(retryDelaySeconds(8), 3840);
  assert.equal(retryDelaySeconds(30), 86400);
  assert.throws(() => retryDelaySeconds(0));
  assert.equal(MAX_BACKUP_EVENT_ATTEMPTS, 20);
  assert.equal(isPermanentBackupError({ response: { status: 403 } }), true);
  assert.equal(isPermanentBackupError({ response: { status: 429 } }), false);
  assert.equal(isPermanentBackupError(new Error("network unavailable")), false);
});

test("Google row upsert locates a stable Code ID instead of relying on an assigned row", () => {
  const rows = [["Code ID", "Nom"], ["NOUR-1001", "Élève 1"], ["NOUR-1042", "Élève 2"]];
  assert.equal(findStudentRowIndex(rows, "NOUR-1042"), 2);
  assert.equal(findStudentRowIndex(rows, "NOUR-9999"), -1);
});

test("offline snapshots are scoped to one authenticated administrator and clearable", async () => {
  const value = { students: [{ codeId: "NOUR-1042" }], paid: 15000 };
  await writeBackupCache("admin-a:payments", "admin-a", value);
  assert.deepEqual((await readBackupCache("admin-a:payments", "admin-a"))?.data, value);
  assert.equal(await readBackupCache("admin-a:payments", "admin-b"), null);
  await clearAllBackupCache();
  assert.equal(await readBackupCache("admin-a:payments", "admin-a"), null);
});

test("offline snapshots reject incompatible or corrupted records", async () => {
  const db = await indexedDB.open("nour-admin-backup", 3);
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    db.onsuccess = () => resolve(db.result);
    db.onerror = () => reject(db.error);
  });
  const transaction = database.transaction("snapshots", "readwrite");
  transaction.objectStore("snapshots").put({
    key: "admin-a:students", scope: "admin-a", savedAt: new Date().toISOString(),
    schemaVersion: 1, data: { students: "corrupt" },
  });
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  assert.equal(await readBackupCache("admin-a:students", "admin-a"), null);
});

test("offline banner uses the required message and mutating payment actions are disabled in cached mode", async () => {
  const banner = await readFile(new URL("../src/components/admin/offline-banner.tsx", import.meta.url), "utf8");
  const payments = await readFile(new URL("../src/components/admin/payments-manager.tsx", import.meta.url), "utf8");
  const offlinePage = await readFile(new URL("../public/offline.html", import.meta.url), "utf8");
  const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(banner, /Mode Hors-Ligne : Affichage de la dernière sauvegarde locale/);
  assert.match(banner, /Dernière mise à jour :/);
  assert.match(offlinePage, /Impossible d’afficher les données hors ligne : aucune sauvegarde locale disponible\./);
  assert.match(serviceWorker, /url\.pathname === "\/admin\/students" \|\| url\.pathname === "\/admin\/payments"/);
  assert.match(payments, /pending \|\| offline\.isOffline \|\| offline\.isUsingCachedData/);
});
