import "server-only";
import ExcelJS from "exceljs";
import { collectBackupDataset, levelMonthAmounts } from "@/lib/backup/data";
import { moneyToCents } from "@/lib/payments/finance";

function workbookDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function sheetName(levelName: string, used: Set<string>): string {
  const base = (levelName.replace(/[\[\]:*?/\\]/g, " ").trim() || "Niveau").slice(0, 31);
  let name = base;
  let suffix = 2;
  while (used.has(name.toLocaleLowerCase())) {
    const tail = ` (${suffix++})`;
    name = `${base.slice(0, 31 - tail.length)}${tail}`;
  }
  used.add(name.toLocaleLowerCase());
  return name;
}

function styleHeader(row: ExcelJS.Row): void {
  row.height = 30;
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1249B5" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function paymentState(expected: number, paid: number): "PAID" | "PARTIAL" | "UNPAID" {
  if (expected <= 0 || paid >= expected) return "PAID";
  return paid > 0 ? "PARTIAL" : "UNPAID";
}

export async function buildExcelBackup(): Promise<{ buffer: Buffer; filename: string; recordCount: number }> {
  const now = new Date();
  const dataset = await collectBackupDataset(now);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Centre NOUR";
  workbook.created = now;
  workbook.modified = now;
  workbook.subject = "Registre scolaire et sauvegarde financière";

  const currentPayment = (student: typeof dataset.students[number]) => student.payments.find(
    payment => payment.year === dataset.currentPeriod.year && payment.month === dataset.currentPeriod.month,
  );
  const currentTotals = dataset.students.reduce((totals, student) => {
    const expected = student.groups.reduce((sum, group) => sum + moneyToCents(group.monthlyPrice), 0);
    const payment = currentPayment(student);
    const paid = payment ? moneyToCents(payment.paidAmount) : 0;
    totals.expected += expected;
    totals.paid += paid;
    const state = paymentState(expected, paid);
    totals[state]++;
    return totals;
  }, { expected: 0, paid: 0, PAID: 0, PARTIAL: 0, UNPAID: 0 });

  const summary = workbook.addWorksheet("Résumé Financier", { views: [{ state: "frozen", ySplit: 1 }] });
  summary.columns = [
    { header: "Indicateur", key: "metric", width: 36 },
    { header: "Valeur", key: "value", width: 24 },
  ];
  styleHeader(summary.getRow(1));
  const summaryRows: Array<[string, string | number]> = [
    ["Centre", "Centre NOUR"],
    ["Date de sauvegarde", workbookDate(now)],
    ["Période financière", `${dataset.currentPeriod.month}/${dataset.currentPeriod.year}`],
    ["Nombre total d’élèves", dataset.students.length],
    ["Total attendu (MAD)", currentTotals.expected / 100],
    ["Total payé (MAD)", currentTotals.paid / 100],
    ["Total restant (MAD)", Math.max(0, currentTotals.expected - currentTotals.paid) / 100],
    ["Élèves entièrement réglés", currentTotals.PAID],
    ["Élèves avec paiement partiel", currentTotals.PARTIAL],
    ["Élèves non payés", currentTotals.UNPAID],
    ["Taux d’encaissement", currentTotals.expected ? currentTotals.paid / currentTotals.expected : 0],
  ];
  for (const [metric, value] of summaryRows) summary.addRow({ metric, value });
  for (const row of [6, 7, 8]) summary.getCell(row, 2).numFmt = '#,##0.00 "MAD"';
  summary.getCell(12, 2).numFmt = "0.00%";
  summary.autoFilter = `A1:B${summaryRows.length + 1}`;
  for (const [rowNumber, color] of [[9, "FFD9F2E3"], [10, "FFFFF1CC"], [11, "FFFDE2E2"]] as const) {
    summary.getCell(rowNumber, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  }

  const usedNames = new Set(["résumé financier"]);
  const headers = [
    "Code ID", "Nom Complet", "Téléphone", "Matières", "Tarif Mensuel",
    ...dataset.months.map(period => period.name),
    "Total Payé", "Total Restant", "Statut Global",
  ];
  for (const level of dataset.levels) {
    const worksheet = workbook.addWorksheet(sheetName(level.name, usedNames), { views: [{ state: "frozen", ySplit: 1 }] });
    worksheet.columns = headers.map((header, index) => ({
      header,
      key: `column${index}`,
      width: index === 1 ? 28 : index === 3 ? 32 : index === 0 ? 18 : index === headers.length - 1 ? 18 : 15,
    }));
    styleHeader(worksheet.getRow(1));
    const students = dataset.students.filter(student => student.groups.some(group => group.levelId === level.id));
    for (const student of students) {
      const groups = student.groups.filter(group => group.levelId === level.id);
      const expectedCents = groups.reduce((sum, group) => sum + moneyToCents(group.monthlyPrice), 0);
      let totalPaidCents = 0;
      let totalRemainingCents = 0;
      let currentExpectedCents = 0;
      let currentPaidCents = 0;
      const monthlyCells = dataset.months.map(period => {
        const amounts = levelMonthAmounts(student, period.year, period.month, level.id);
        totalPaidCents += amounts.paidCents;
        totalRemainingCents += Math.max(0, amounts.expectedCents - amounts.paidCents);
        if (period.year === dataset.currentPeriod.year && period.month === dataset.currentPeriod.month) {
          currentExpectedCents = amounts.expectedCents;
          currentPaidCents = amounts.paidCents;
        }
        return amounts.paidCents / 100;
      });
      const row = worksheet.addRow([
        student.codeId,
        student.fullName,
        student.phone ?? "",
        groups.map(group => group.name).join(", "),
        expectedCents / 100,
        ...monthlyCells,
        totalPaidCents / 100,
        totalRemainingCents / 100,
        paymentState(currentExpectedCents, currentPaidCents),
      ]);
      row.getCell(5).numFmt = '#,##0.00 "MAD"';
      for (let column = 6; column <= 15; column++) row.getCell(column).numFmt = '#,##0.00 "MAD"';
      row.getCell(16).numFmt = '#,##0.00 "MAD"';
      row.getCell(17).numFmt = '#,##0.00 "MAD"';
      const status = row.getCell(18);
      status.font = { bold: true };
      status.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: status.value === "PAID" ? "FFD9F2E3" : status.value === "PARTIAL" ? "FFFFF1CC" : "FFFDE2E2" },
      };
    }
    worksheet.autoFilter = { from: "A1", to: `${worksheet.getColumn(headers.length).letter}${worksheet.rowCount}` };
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: `NOUR_Backup_${workbookDate(now)}.xlsx`, recordCount: dataset.students.length };
}
