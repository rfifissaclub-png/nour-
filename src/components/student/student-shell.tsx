import { getTranslation } from "@/lib/i18n/server";
import Link from "next/link";
import { BookOpen, Home, UserRound } from "lucide-react";
import LogoutButton from "@/components/auth/logout-button";

const items = [
  { href: "/student/home", label: "Accueil", icon: Home },
  { href: "/student/home#subjects", label: "Mes matières", icon: BookOpen },
  { href: "/student/account", label: "Mon compte", icon: UserRound },
];

export default async function StudentShell({ children }: { children: React.ReactNode }) {
  const { t } = await getTranslation();
  return (
    <div className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-7 lg:px-10">
          <Link href="/student/home" className="text-lg font-extrabold tracking-tight text-primary">NOUR<span className="text-amber-500">.</span></Link>
          <div className="hidden text-xs font-medium text-slate-500 sm:block">{t("Espace élève")}</div>
          <LogoutButton />
        </div>
        <nav aria-label={t("Navigation élève")} className="mx-auto hidden max-w-7xl gap-2 px-4 pb-3 sm:px-7 lg:flex lg:px-10">
          {items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-600 transition hover:bg-primary-soft hover:text-primary"><Icon size={16} />{t(label)}</Link>)}
        </nav>
      </header>
      <div>{children}</div>
      <nav aria-label={t("Navigation mobile élève")} className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-safe-bottom shadow-navigation backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-3">
          {items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium text-slate-600 transition hover:text-primary"><Icon size={19} />{t(label)}</Link>)}
        </div>
      </nav>
    </div>
  );
}
