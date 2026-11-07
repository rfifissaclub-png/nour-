import LanguageProvider from "@/components/i18n/language-provider";
import { getTranslation } from "@/lib/i18n/server";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/pwa/service-worker-register";
export const metadata: Metadata = {
  title: { default: "Centre NOUR", template: "%s | NOUR" },
  description: "Votre espace scolaire au centre de soutien NOUR.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "NOUR" },
  icons: {
    icon: [{ url: "/icons/nour-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0052D4" };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { language } = await getTranslation();
  return <html lang={language} dir={language === "ar" ? "rtl" : "ltr"}><body><LanguageProvider initialLanguage={language}>{children}</LanguageProvider><ServiceWorkerRegister /></body></html>;
}
