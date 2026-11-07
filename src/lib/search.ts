/** Search human names in French/Arabic, and phones without formatting. */
export function normalizeSearch(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ـ/g, "")
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0))
    .toLocaleLowerCase("fr").trim();
}
export function matchesSearch(query: string, ...values: (string | null | undefined)[]): boolean {
  const normalized = normalizeSearch(query);
  if (!normalized) return true;
  const haystack = values.map(value => normalizeSearch(value ?? "")).join(" ");
  if (/^[+\d\s().-]+$/.test(normalized)) {
    const digits = normalized.replace(/\D/g, "").replace(/^00212/, "212").replace(/^0/, "212");
    return values.some(value => normalizeSearch(value ?? "").replace(/\D/g, "").includes(digits));
  }
  return normalized.split(/\s+/).every(word => haystack.includes(word));
}
