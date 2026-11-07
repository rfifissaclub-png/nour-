"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { translate, type Language } from "@/lib/i18n/translate";
const LanguageContext = createContext<Language>("fr");
export function useTranslation() {
  const language = useContext(LanguageContext);
  return { language, locale: language === "ar" ? "ar-MA" : "fr-MA", t: (message: string) => translate(language, message) };
}
export function Trans({ children }: { children: string }) {
  const { t } = useTranslation();
  return <>{t(children)}</>;
}
export default function LanguageProvider({ initialLanguage, children }: { initialLanguage: Language; children: ReactNode }) {
  const [language, setLanguage] = useState(initialLanguage);
  const router = useRouter();
  function changeLanguage(value: Language) {
    document.cookie = `nour-language=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    document.documentElement.lang = value;
    document.documentElement.dir = value === "ar" ? "rtl" : "ltr";
    setLanguage(value);
    router.refresh();
  }
  return <LanguageContext.Provider value={language}>
    <div className="flex justify-end gap-1 border-b border-slate-200 bg-slate-50 px-4 py-1.5 print:hidden" role="group" aria-label="Langue / اللغة">
      <button type="button" lang="fr" aria-pressed={language === "fr"} onClick={() => changeLanguage("fr")} className={`min-h-9 rounded-lg px-3 text-sm ${language === "fr" ? "bg-primary font-semibold text-white" : "text-slate-700"}`}>Français</button>
      <button type="button" lang="ar" aria-pressed={language === "ar"} onClick={() => changeLanguage("ar")} className={`min-h-9 rounded-lg px-3 text-sm ${language === "ar" ? "bg-primary font-semibold text-white" : "text-slate-700"}`}>العربية</button>
    </div>
    {children}
  </LanguageContext.Provider>;
}
