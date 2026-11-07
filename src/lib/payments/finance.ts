export function moneyToCents(value: string | number): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid monetary value");
  return Math.round(amount * 100);
}

export function sumMoneyCents(values: Array<string | number>): number {
  return values.reduce<number>((total, value) => total + moneyToCents(value), 0);
}

export function allocatePaymentLineCents(paidCents: number, invoiceCents: number, lineCents: number[]): number[] {
  if (![paidCents, invoiceCents, ...lineCents].every(Number.isSafeInteger) || paidCents < 0 || invoiceCents < 0 || lineCents.some(amount => amount < 0)) {
    throw new Error("Invalid payment allocation");
  }
  if (lineCents.length === 0) return [];
  if (lineCents.reduce((total, amount) => total + amount, 0) !== invoiceCents || paidCents > invoiceCents) {
    throw new Error("Payment line amounts do not match the invoice");
  }
  if (invoiceCents === 0) return lineCents.map(() => 0);

  const total = BigInt(invoiceCents);
  const paid = BigInt(paidCents);
  const shares = lineCents.map(amount => {
    const product = paid * BigInt(amount);
    return { amount: Number(product / total), remainder: product % total };
  });
  let remainderCents = paidCents - shares.reduce((sum, share) => sum + share.amount, 0);
  const remainderOrder = shares
    .map((share, index) => ({ index, remainder: share.remainder }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const { index } of remainderOrder) {
    if (remainderCents === 0) break;
    shares[index].amount++;
    remainderCents--;
  }
  return shares.map(share => share.amount);
}

export function calculateTeacherShareCents(paidLineCents: number, percentage: string | number): number {
  const rate = typeof percentage === "number" ? percentage : Number(percentage);
  if (!Number.isSafeInteger(paidLineCents) || paidLineCents < 0 || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new Error("Invalid teacher commission");
  }
  return Math.round(paidLineCents * rate / 100);
}
