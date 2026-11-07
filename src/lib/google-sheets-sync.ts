import "server-only";
import { google, type sheets_v4 } from "googleapis";
import { db } from "@/lib/prisma";
import { buildMonthlyPaymentStatus, collectBackupDataset, levelMonthAmounts, type BackupDataset, type BackupStudent } from "@/lib/backup/data";
import { moneyToCents } from "@/lib/payments/finance";
import { findStudentRowIndex } from "@/lib/backup/google-row";
import { sanitizeWorksheetTitle } from "@/lib/backup/google-sheet-utils";

export { findStudentRowIndex } from "@/lib/backup/google-row";

const STUDENT_HEADERS = [
  "Code ID", "Nom Complet", "Téléphone", "Matières", "Tarif Mensuel",
  "Septembre", "Octobre", "Novembre", "Décembre", "Janvier",
  "Février", "Mars", "Avril", "Mai", "Juin", "Dernière Mise à Jour",
];
const SHEET_LOG_HEADERS = ["Date", "Type", "Identifiant", "Statut", "Détail"];

export function createGoogleSheetsClient(): { sheets: sheets_v4.Sheets; spreadsheetId: string } {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!spreadsheetId || !email || !privateKey) {
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY are required");
  }
  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return { sheets: google.sheets({ version: "v4", auth }), spreadsheetId };
}

export async function ensureWorksheetForLevel(levelName: string, levelId?: string): Promise<string> {
  const client = createGoogleSheetsClient();
  await ensureBaseWorksheets(client.sheets, client.spreadsheetId);
  const title = sanitizeWorksheetTitle(levelName, levelId);
  const spreadsheet = await client.sheets.spreadsheets.get({
    spreadsheetId: client.spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const existing = spreadsheet.data.sheets?.find(sheet => sheet.properties?.title === title)?.properties?.title;
  if (existing) {
    await ensureHeaders(client.sheets, client.spreadsheetId, title, STUDENT_HEADERS);
    return title;
  }
  await client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: client.spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
  await ensureHeaders(client.sheets, client.spreadsheetId, title, STUDENT_HEADERS);
  return title;
}

async function ensureBaseWorksheets(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<void> {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
  const titles = new Set(metadata.data.sheets?.map(sheet => sheet.properties?.title).filter((title): title is string => Boolean(title)));
  const requests = ["Résumé", "Sync Log"].filter(title => !titles.has(title)).map(title => ({
    addSheet: { properties: { title } },
  }));
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  await ensureHeaders(sheets, spreadsheetId, "Sync Log", SHEET_LOG_HEADERS);
}

async function ensureHeaders(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  title: string,
  headers: string[],
): Promise<void> {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteSheet(title)}!A1:${columnName(headers.length)}1`,
  });
  if (result.data.values?.[0]?.[0] === headers[0]) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheet(title)}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [headers] },
  });
}

function quoteSheet(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

function columnName(column: number): string {
  let result = "";
  while (column > 0) {
    const remainder = (column - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    column = Math.floor((column - 1) / 26);
  }
  return result;
}

export async function updateStudentRowByCodeId(sheetName: string, codeId: string, values: Array<string | number>): Promise<void> {
  const { sheets, spreadsheetId } = createGoogleSheetsClient();
  await ensureHeaders(sheets, spreadsheetId, sheetName, STUDENT_HEADERS);
  const keyColumn = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteSheet(sheetName)}!A:A`,
  });
  const rowIndex = findStudentRowIndex(keyColumn.data.values ?? [], codeId);
  const range = rowIndex >= 1
    ? `${quoteSheet(sheetName)}!A${rowIndex + 1}:${columnName(values.length)}${rowIndex + 1}`
    : `${quoteSheet(sheetName)}!A:${columnName(values.length)}`;
  if (rowIndex >= 1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values: [values] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [values] },
    });
  }
}

export const updateStudentRow = updateStudentRowByCodeId;

function studentRow(student: BackupStudent, levelId: string, dataset: BackupDataset): Array<string | number> {
  const levelGroups = student.groups.filter(group => group.levelId === levelId);
  const priceCents = levelGroups.reduce((sum, group) => sum + moneyToCents(group.monthlyPrice), 0);
  const months = dataset.months.map(period => {
    const amounts = levelMonthAmounts(student, period.year, period.month, levelId);
    return buildMonthlyPaymentStatus(amounts.paidCents, amounts.expectedCents);
  });
  return [
    student.codeId,
    student.fullName,
    student.phone ?? "",
    levelGroups.map(group => group.name).join(", "),
    priceCents / 100,
    ...months,
    new Date().toISOString(),
  ];
}

async function findStudent(dataset: BackupDataset, studentId: string): Promise<BackupStudent> {
  const student = dataset.students.find(item => item.id === studentId);
  if (!student) throw new Error(`Student ${studentId} does not exist in the backup dataset`);
  return student;
}

export async function syncStudentToGoogleSheet(studentId: string): Promise<number> {
  const dataset = await collectBackupDataset();
  const student = await findStudent(dataset, studentId);
  const groupsByLevel = new Map<string, string>();
  for (const group of student.groups) groupsByLevel.set(group.levelId, group.levelName);
  for (const [levelId, levelName] of groupsByLevel) {
    const sheet = await ensureWorksheetForLevel(levelName, levelId);
    await updateStudentRow(sheet, student.codeId, studentRow(student, levelId, dataset));
  }
  return groupsByLevel.size;
}

export async function syncPaymentToGoogleSheet(paymentId: string): Promise<number> {
  const payment = await db().payment.findUnique({ where: { id: paymentId }, select: { studentId: true } });
  if (!payment) throw new Error(`Payment ${paymentId} does not exist`);
  return syncStudentToGoogleSheet(payment.studentId);
}

export async function syncToGoogleSheet(type: "ENROLLMENT_CREATED" | "ENROLLMENT_UPDATED" | "PAYMENT_UPDATED", entityId: string): Promise<number> {
  if (type === "PAYMENT_UPDATED") return syncPaymentToGoogleSheet(entityId);
  const enrollment = await db().enrollment.findUnique({ where: { id: entityId }, select: { studentId: true } });
  if (!enrollment) throw new Error(`Enrollment ${entityId} does not exist`);
  return syncStudentToGoogleSheet(enrollment.studentId);
}

export async function fullSyncToGoogleSheet(): Promise<number> {
  const dataset = await collectBackupDataset();
  const { sheets, spreadsheetId } = createGoogleSheetsClient();
  await ensureBaseWorksheets(sheets, spreadsheetId);
  const titleByLevel = new Map<string, string>();
  for (const level of dataset.levels) titleByLevel.set(level.id, await ensureWorksheetForLevel(level.name, level.id));
  let rowCount = 0;
  for (const student of dataset.students) {
    const groupsByLevel = new Map(student.groups.map(group => [group.levelId, group.levelName]));
    for (const [levelId, levelName] of groupsByLevel) {
      const sheet = titleByLevel.get(levelId) ?? await ensureWorksheetForLevel(levelName, levelId);
      await updateStudentRow(sheet, student.codeId, studentRow(student, levelId, dataset));
      rowCount++;
    }
  }
  await updateSummaryWorksheet(sheets, spreadsheetId, dataset);
  return rowCount;
}

async function updateSummaryWorksheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  dataset: BackupDataset,
): Promise<void> {
  const { year, month } = dataset.currentPeriod;
  const totals = dataset.students.reduce((result, student) => {
    let expectedForStudent = 0;
    let paidForStudent = 0;
    for (const levelId of new Set(student.groups.map(group => group.levelId))) {
      const amounts = levelMonthAmounts(student, year, month, levelId);
      result.expected += amounts.expectedCents;
      result.paid += amounts.paidCents;
      expectedForStudent += amounts.expectedCents;
      paidForStudent += amounts.paidCents;
    }
    if (expectedForStudent <= 0 || paidForStudent >= expectedForStudent) result.PAID++;
    else if (paidForStudent > 0) result.PARTIAL++;
    else result.UNPAID++;
    return result;
  }, { expected: 0, paid: 0, PAID: 0, PARTIAL: 0, UNPAID: 0 });
  const rows = [
    ["Indicateur", "Valeur"],
    ["Centre", "Centre NOUR"],
    ["Date de synchronisation", new Date().toISOString()],
    ["Nombre total d’élèves", dataset.students.length],
    ["Total attendu (DH)", totals.expected / 100],
    ["Total payé (DH)", totals.paid / 100],
    ["Total restant (DH)", Math.max(0, totals.expected - totals.paid) / 100],
    ["Nombre PAID", totals.PAID],
    ["Nombre PARTIAL", totals.PARTIAL],
    ["Nombre UNPAID", totals.UNPAID],
    ["Taux de recouvrement", totals.expected ? totals.paid / totals.expected : 0],
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'Résumé'!A1:B11",
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}

export async function appendGoogleSyncLog(type: string, entityId: string, status: string, detail: string): Promise<void> {
  const { sheets, spreadsheetId } = createGoogleSheetsClient();
  await ensureBaseWorksheets(sheets, spreadsheetId);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Sync Log'!A:E",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[new Date().toISOString(), type, entityId, status, detail.slice(0, 500)]] },
  });
}

export const writeSyncLog = appendGoogleSyncLog;
