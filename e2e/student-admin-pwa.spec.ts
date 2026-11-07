import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/prisma";
import { currentMoroccoPeriod } from "../src/lib/payments/period";
import { hashPin } from "../src/lib/auth/pin";
import { hashAdminPassword } from "../src/lib/auth/password";
import { createStudentQrToken } from "../src/lib/access/qr";
import type { Role } from "../src/lib/auth/constants";

const origin = "http://127.0.0.1:3100";
const userIds: string[] = [];
const levelIds: string[] = [];
const groupIds: string[] = [];
const resourceIds: string[] = [];
const paymentIds: string[] = [];
const backupEventIds: string[] = [];
const testLevelIds: string[] = [];
const adminPassword = "Integration-Admin-Password-2026";

async function account(role: Role, name: string) {
  const user = await db().user.create({
    data: {
      codeId: `NOUR-${randomUUID().replaceAll("-", "").slice(0, 20)}`.toUpperCase(),
      fullName: name,
      role,
      pin: await hashPin("0123"),
      passwordHash: role === "ADMIN" ? await hashAdminPassword(adminPassword) : null,
    },
  });
  userIds.push(user.id);
  return user;
}

async function login(request: APIRequestContext, user: { codeId: string; role: Role }) {
  const response = await request.post("/api/auth/login", {
    headers: { Origin: origin },
    data: user.role === "ADMIN"
      ? { identifier: user.codeId, password: adminPassword }
      : { identifier: user.codeId, pin: "0123" },
  });
  expect(response.status()).toBe(200);
}

test.beforeAll(() => {
  if (process.env.NOUR_TEST_DATABASE !== "1" || !process.env.DATABASE_URL || !process.env.DIRECT_URL) {
    throw new Error("Use a disposable PostgreSQL database and set NOUR_TEST_DATABASE=1, DATABASE_URL and DIRECT_URL");
  }
});

test.afterAll(async () => {
  if (resourceIds.length) await db().resource.deleteMany({ where: { id: { in: resourceIds } } });
  if (backupEventIds.length) await db().backupEvent.deleteMany({ where: { id: { in: backupEventIds } } });
  if (groupIds.length) {
    await db().paymentLine.deleteMany({ where: { groupId: { in: groupIds } } });
    await db().enrollment.deleteMany({ where: { groupId: { in: groupIds } } });
  }
  if (userIds.length) await db().payment.deleteMany({ where: { studentId: { in: userIds } } });
  if (paymentIds.length) await db().payment.deleteMany({ where: { id: { in: paymentIds } } });
  if (groupIds.length) await db().subjectGroup.deleteMany({ where: { id: { in: groupIds } } });
  if (levelIds.length) await db().level.deleteMany({ where: { id: { in: levelIds } } });
  if (testLevelIds.length) await db().level.deleteMany({ where: { id: { in: testLevelIds } } });
  if (userIds.length) await db().user.deleteMany({ where: { id: { in: userIds } } });
  await db().$disconnect();
});

test("admin Excel export is authorized, structured, and logs successful backups", async ({ request }) => {
  const anonymous = await request.get("/api/backup/excel");
  expect(anonymous.status()).toBe(401);
  expect((await request.get("/api/backup/excel/latest")).status()).toBe(401);

  const student = await account("STUDENT", "Élève export NOUR");
  const teacher = await account("TEACHER", "Professeur export");
  const level = await db().level.create({ data: { name: `Niveau export ${randomUUID().slice(0, 8)}` } });
  testLevelIds.push(level.id);
  const group = await db().subjectGroup.create({
    data: { name: "Sciences", levelId: level.id, teacherId: teacher.id, monthlyPrice: "250.00", teacherPercentage: "50.00" },
  });
  groupIds.push(group.id);
  await db().enrollment.create({ data: { studentId: student.id, groupId: group.id, monthlyPrice: "250.00" } });

  const nonAdmin = await account("TEACHER", "Professeur export interdit");
  await login(request, nonAdmin);
  expect((await request.get("/api/backup/excel")).status()).toBe(403);
  expect((await request.get("/api/backup/excel/latest")).status()).toBe(403);

  const admin = await account("ADMIN", "Admin export");
  await login(request, admin);
  const response = await request.get("/api/backup/excel");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  expect(response.headers()["content-disposition"]).toMatch(/NOUR_Backup_\d{4}-\d{2}-\d{2}\.xlsx/);
  const workbook = new ExcelJS.Workbook();
  const responseBody = await response.body();
  const excelBuffer = new ArrayBuffer(responseBody.byteLength);
  new Uint8Array(excelBuffer).set(responseBody);
  await workbook.xlsx.load(excelBuffer);
  expect(workbook.worksheets[0].name).toBe("Résumé Financier");
  expect(workbook.worksheets.some(sheet => sheet.name.startsWith(level.name))).toBeTruthy();
  const log = await db().backupLog.findFirst({ where: { type: "EXCEL", status: "SUCCESS", initiatedBy: admin.id } });
  expect(log?.filename).toMatch(/^NOUR_Backup_\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test("backup worker rejects requests without its server secret", async ({ request }) => {
  expect((await request.post("/api/backup/worker")).status()).toBe(401);
  expect((await request.get("/api/backup/worker")).status()).toBe(401);
});

test("student and payment mutations persist outbox events and offline views stay read-only", async ({ page }) => {
  const admin = await account("ADMIN", "Admin outbox intégration");
  const teacher = await account("TEACHER", "Professeur outbox");
  const level = await db().level.create({ data: { name: `Niveau outbox ${randomUUID().slice(0, 8)}` } });
  testLevelIds.push(level.id);
  const group = await db().subjectGroup.create({
    data: { name: "Langues", levelId: level.id, teacherId: teacher.id, monthlyPrice: "180.00", teacherPercentage: "40.00" },
  });
  groupIds.push(group.id);
  await login(page.request, admin);
  await page.goto("/admin/students");
  await page.waitForResponse(response => response.url().includes("/api/backup/data?view=students") && response.ok());
  await page.locator("#student-name").fill("Élève outbox créé");
  await page.locator("#student-phone").fill("+212612345679");
  await page.locator("#student-level").selectOption(level.id);
  await page.getByRole("checkbox", { name: "Langues" }).check();
  await page.locator(`#group-price-${group.id}`).fill("180.00");
  await page.getByRole("button", { name: "Créer le compte élève" }).click();
  await expect(page.getByText("Élève outbox créé", { exact: false }).first()).toBeVisible();
  const createdStudent = await db().user.findFirstOrThrow({
    where: { fullName: "Élève outbox créé", role: "STUDENT" },
    select: { id: true },
  });
  userIds.push(createdStudent.id);
  const enrollment = await db().enrollment.findFirstOrThrow({ where: { studentId: createdStudent.id } });
  const enrollmentEvent = await db().backupEvent.findFirstOrThrow({ where: { type: "ENROLLMENT_CREATED", entityId: enrollment.id } });
  backupEventIds.push(enrollmentEvent.id);
  expect(enrollmentEvent.status).toBe("PENDING");
  expect(enrollment.monthlyPrice.toString()).toBe("180");

  await page.getByRole("button", { name: "Modifier le tarif de Langues" }).click();
  await page.locator(`#edit-price-${enrollment.id}`).fill("220.00");
  await page.getByRole("button", { name: "Enregistrer le tarif de Langues" }).click();
  await expect.poll(async () => (await db().enrollment.findUniqueOrThrow({ where: { id: enrollment.id }, select: { monthlyPrice: true } })).monthlyPrice.toString()).toBe("220");
  const updatedEnrollmentEvent = await db().backupEvent.findFirstOrThrow({ where: { type: "ENROLLMENT_UPDATED", entityId: enrollment.id } });
  backupEventIds.push(updatedEnrollmentEvent.id);
  expect(updatedEnrollmentEvent.status).toBe("PENDING");

  await page.goto("/admin/payments");
  await page.waitForResponse(response => response.url().includes("/api/backup/data?view=payments") && response.ok());
  const paymentRow = page.getByRole("row").filter({ hasText: "Élève outbox créé" });
  await expect(paymentRow).toContainText("220,00 MAD");
  await paymentRow.getByRole("button", { name: "Payé" }).click();
  await expect.poll(async () => {
    const updatedPayment = await db().payment.findUnique({
      where: { studentId_month_year: { studentId: createdStudent.id, month: currentMoroccoPeriod().month, year: currentMoroccoPeriod().year } },
      select: { status: true },
    });
    return updatedPayment?.status;
  }, { timeout: 20000 }).toBe("PAID");
  await expect(paymentRow.locator("td").nth(3).getByText("Payé")).toBeVisible({ timeout: 20000 });
  const payment = await db().payment.findFirstOrThrow({ where: { studentId: createdStudent.id }, select: { id: true } });
  const paymentEvent = await db().backupEvent.findFirstOrThrow({ where: { type: "PAYMENT_UPDATED", entityId: payment.id } });
  backupEventIds.push(paymentEvent.id);
  expect(paymentEvent.status).toBe("PENDING");

  await page.goto("/admin/students");
  await page.waitForResponse(response => response.url().includes("/api/backup/data?view=students") && response.ok());
  await page.context().setOffline(true);
  await expect(page.getByText("Mode Hors-Ligne : Affichage de la dernière sauvegarde locale")).toBeVisible();
  await expect(page.getByRole("button", { name: "Créer le compte élève" })).toBeDisabled();
  await page.context().setOffline(false);
});

test("student sees only enrolled resources, monthly account and personal QR; PWA files load", async ({ page, request }) => {
  const student = await account("STUDENT", "Élève intégration NOUR");
  const otherStudent = await account("STUDENT", "Élève non inscrit");
  const teacher = await account("TEACHER", "Professeur intégration");
  const level = await db().level.create({ data: { name: `Niveau intégration ${randomUUID().slice(0, 8)}` } });
  levelIds.push(level.id);
  const group = await db().subjectGroup.create({
    data: { name: "Mathématiques", levelId: level.id, teacherId: teacher.id, monthlyPrice: "300.00", teacherPercentage: "50.00" },
  });
  groupIds.push(group.id);
  await db().enrollment.create({ data: { studentId: student.id, groupId: group.id, monthlyPrice: "300.00" } });
  const exam = await db().resource.create({
    data: {
      title: "Devoir surveillé intégration",
      type: "EXAM",
      examAt: new Date(Date.now() + 7 * 86400000),
      externalLink: "https://example.com/exam",
      groupId: group.id,
      teacherId: teacher.id,
    },
  });
  resourceIds.push(exam.id);
  const course = await db().resource.create({
    data: {
      title: "Cours intégration",
      type: "COURSE",
      externalLink: "https://example.com/course",
      groupId: group.id,
      teacherId: teacher.id,
    },
  });
  resourceIds.push(course.id);
  const { year, month } = currentMoroccoPeriod();
  const payment = await db().payment.create({
    data: {
      studentId: student.id,
      year,
      month,
      totalAmount: "300.00",
      paidAmount: "100.00",
      status: "PARTIAL",
      paidAt: new Date(),
    },
  });
  paymentIds.push(payment.id);

  await login(page.request, student);
  await page.goto("/student/home");
  await expect(page.getByRole("heading", { name: "Mes matières" })).toBeVisible();
  await expect(page.getByText("Devoir surveillé intégration")).toBeVisible();
  await expect(page.getByText("Reste : 200,00 MAD")).toBeVisible();
  await page.getByRole("link", { name: /Mathématiques/ }).click();
  await expect(page).toHaveURL(new RegExp(`/student/subjects/${group.id}$`));
  await page.getByRole("tab", { name: /Devoirs/ }).click();
  await expect(page.getByText("Devoir surveillé intégration")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ouvrir le lien" })).toHaveAttribute("href", "https://example.com/exam");
  await page.goto("/student/account");
  await expect(page.getByRole("heading", { name: "Mon compte" })).toBeVisible();
  await expect(page.getByLabel(`QR code personnel ${student.codeId}`)).toBeVisible();
  await expect(page.getByText("200,00 MAD")).toBeVisible();

  await login(page.request, otherStudent);
  const denied = await page.request.get(`/student/subjects/${group.id}`, { maxRedirects: 0 });
  expect(denied.status()).toBe(404);
  const manifestResponse = await request.get("/manifest.json");
  expect(manifestResponse.ok()).toBeTruthy();
  expect((await manifestResponse.json()).display).toBe("standalone");
  expect((await request.get("/icons/nour-192.png")).ok()).toBeTruthy();
  expect((await request.get("/sw.js")).ok()).toBeTruthy();
});

test("admin QR scan validates monthly payment and rejects other roles", async ({ request }) => {
  const admin = await account("ADMIN", "Admin scan intégration");
  const student = await account("STUDENT", "Élève QR intégration");
  const { year, month } = currentMoroccoPeriod();
  const payment = await db().payment.create({
    data: { studentId: student.id, year, month, totalAmount: "200.00", paidAmount: "200.00", status: "PAID", paidAt: new Date() },
  });
  paymentIds.push(payment.id);

  await login(request, admin);
  const paid = await request.post("/api/admin/scan", {
    headers: { Origin: origin },
    data: { qrToken: createStudentQrToken(student.codeId, student.qrVersion) },
  });
  expect(paid.status()).toBe(200);
  expect(await paid.json()).toMatchObject({ codeId: student.codeId, fullName: student.fullName, status: "PAID", remainingCents: 0 });

  await db().payment.update({ where: { id: payment.id }, data: { paidAmount: "50.00", status: "PARTIAL" } });
  const partial = await request.post("/api/admin/scan", {
    headers: { Origin: origin },
    data: { qrToken: createStudentQrToken(student.codeId, student.qrVersion) },
  });
  expect(await partial.json()).toMatchObject({ status: "PARTIAL", remainingCents: 15000 });
  expect((await request.post("/api/admin/scan", { headers: { Origin: origin }, data: { qrToken: "not-a-token" } })).status()).toBe(400);

  const replacedCardToken = createStudentQrToken(student.codeId, student.qrVersion);
  await db().user.update({ where: { id: student.id }, data: { qrVersion: { increment: 1 } } });
  const revoked = await request.post("/api/admin/scan", {
    headers: { Origin: origin },
    data: { qrToken: replacedCardToken },
  });
  expect(revoked.status()).toBe(400);

  const teacher = await account("TEACHER", "Professeur scan interdit");
  await login(request, teacher);
  expect((await request.post("/api/admin/scan", {
    headers: { Origin: origin },
    data: { qrToken: createStudentQrToken(student.codeId, student.qrVersion) },
  })).status()).toBe(403);
});

test("past and future monthly payments, annual history, multilingual searches and Arabic mobile interface", async ({ page, request }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const admin = await account("ADMIN", "Admin qualité");
  const teacher = await account("TEACHER", "Prof qualité");
  const student = await account("STUDENT", "Élodie أحمد Qualité");
  await db().user.update({ where: { id: student.id }, data: { phone: "+212699887766" } });
  const level = await db().level.create({ data: { name: `Qualité ${randomUUID().slice(0, 8)}` } });
  levelIds.push(level.id);
  const group = await db().subjectGroup.create({ data: { name: "Mathématiques qualité", levelId: level.id, teacherId: teacher.id, monthlyPrice: "300.00", teacherPercentage: "50.00" } });
  groupIds.push(group.id);
  await db().enrollment.create({ data: { studentId: student.id, groupId: group.id, monthlyPrice: "300.00" } });
  expect((await request.get(`/api/admin/students/${student.id}/payments?year=2025`)).status()).toBe(401);
  await login(page.request, admin);
  expect((await page.request.get(`/api/admin/students/${student.id}/payments?year=0000`)).status()).toBe(400);
  await page.goto("/admin/students");
  await page.locator("#student-search").fill("elodie");
  await expect(page.getByText(student.fullName, { exact: true })).toBeVisible();
  await page.locator("#student-search").fill("0699887766");
  await expect(page.getByText(student.fullName, { exact: true })).toBeVisible();
  await page.goto("/admin/payments?month=2025-12");
  await page.locator("#payment-student-search").fill("احمد");
  let row = page.getByRole("row").filter({ hasText: student.fullName });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Payé", exact: true }).click();
  await expect(row.getByRole("button", { name: "Payé", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Mois suivant", exact: true }).click();
  await expect(page.locator("#payment-month")).toHaveValue("2026-01");
  await expect(row.getByRole("button", { name: "Payé", exact: true })).toBeVisible();
  await page.locator("#payment-month").fill("2027-01");
  await expect(page).toHaveURL(/month=2027-01/);
  await row.locator('input[type="number"]').fill("100");
  await row.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(row).toContainText("100,00 MAD");
  await page.locator("#payment-status").selectOption("PAID");
  await expect(row).toHaveCount(0);
  await page.locator("#payment-status").selectOption("PARTIAL");
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Historique", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("row").filter({ hasText: "janvier" })).toContainText("Avance");
  await expect(dialog.getByText("Non enregistré", { exact: true })).toHaveCount(11);
  await dialog.getByRole("button", { name: "Année précédente" }).click();
  await dialog.getByRole("button", { name: "Année précédente" }).click();
  await expect(dialog.getByRole("row").filter({ hasText: "décembre" })).toContainText("Payé");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  const saved = await db().payment.findMany({ where: { studentId: student.id }, orderBy: { year: "asc" } });
  expect(saved.map(payment => [payment.year, payment.month, payment.paidAmount.toString()])).toEqual([[2025, 12, "300"], [2027, 1, "100"]]);
  const events = await db().backupEvent.findMany({ where: { entityId: { in: saved.map(payment => payment.id) } } });
  backupEventIds.push(...events.map(event => event.id));
  await page.getByRole("button", { name: "العربية", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "الأداءات ومستحقات الأساتذة" })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await page.setViewportSize({ width: 390, height: 844 });
  const visibleOverflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(visibleOverflow).toEqual({ documentWidth: 390, bodyWidth: 390 });
  await page.screenshot({ path: "test-results/payments-ar-mobile.png", fullPage: true, caret: "initial" });
  await page.getByRole("button", { name: "Français", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Paiements & paie des profs" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("language choice persists on the public login page without hydration errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/login");
  await page.getByRole("button", { name: "العربية", exact: true }).click();
  await expect(page.getByRole("button", { name: "الدخول إلى فضائي", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "سعداء بعودتك." })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/login-ar-mobile.png", fullPage: true, caret: "initial" });
  expect(errors).toEqual([]);
});
