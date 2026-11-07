import "server-only";
import { cookies } from "next/headers";
import { translate, type Language } from "./translate";
export async function getTranslation() {
  const language: Language = (await cookies()).get("nour-language")?.value === "ar" ? "ar" : "fr";
  return { language, locale: language === "ar" ? "ar-MA" : "fr-MA", t: (message: string) => translate(language, message) };
}
