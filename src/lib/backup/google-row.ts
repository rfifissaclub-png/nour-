export function findStudentRowIndex(rows: unknown[][], codeId: string): number {
  return rows.findIndex((row, index) => index > 0 && row[0] === codeId);
}
