import { parsePhoneNumberFromString } from "libphonenumber-js";
export function latinDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c <= "٩" ? 0x660 : 0x6f0)));
}
export function normalizePhone(value: string): string | null {
  let input = latinDigits(value).trim();
  if (!/^[+\d\s().-]+$/.test(input)) return null;
  if (input.startsWith("00")) input = "+" + input.slice(2);
  const phone = parsePhoneNumberFromString(input, "MA");
  return phone?.isValid() ? phone.number : null;
}
export function normalizeIdentity(value: unknown) {
  if (typeof value !== "string" || value.length > 80) return null;
  const normalized = latinDigits(value).trim().toUpperCase();
  if (/^NOUR-[A-Z0-9-]{1,27}$/.test(normalized)) return { kind: "code" as const, value: normalized };
  const phone = normalizePhone(normalized);
  return phone ? { kind: "phone" as const, value: phone } : null;
}
