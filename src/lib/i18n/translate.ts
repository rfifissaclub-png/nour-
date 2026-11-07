import { ar } from "./ar";
export type Language = "fr" | "ar";
export function translate(language: Language, message: string): string {
  return language === "ar" ? ar[message] ?? message : message;
}
