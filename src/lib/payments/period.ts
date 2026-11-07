export function currentMoroccoPeriod(now = new Date()): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find(part => part.type === "year")?.value);
  const month = Number(parts.find(part => part.type === "month")?.value);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Could not determine the current Morocco billing period");
  }
  return { year, month };
}

export function resolvePeriod(value: unknown, now = new Date()): { year: number; month: number } {
  if (typeof value === "string" && /^(?:[2-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(value)) {
    const [year, month] = value.split("-").map(Number);
    return { year, month };
  }
  return currentMoroccoPeriod(now);
}

export function shiftPeriod(value: string, offset: number): string {
  if (!/^[2-9]\d{3}-(0[1-9]|1[0-2])$/.test(value) || !Number.isInteger(offset)) throw new Error("Invalid billing period");
  const [year, month] = value.split("-").map(Number);
  const index = year * 12 + month - 1 + offset;
  const nextYear = Math.floor(index / 12);
  if (nextYear < 2000 || nextYear > 9999) throw new Error("Billing period out of range");
  return `${nextYear}-${String(index % 12 + 1).padStart(2, "0")}`;
}
