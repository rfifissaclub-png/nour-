import { getTranslation } from "@/lib/i18n/server";
import Image from "next/image";
import Link from "next/link";
import { Banknote, BookOpenCheck, LayoutDashboard, QrCode, Settings, UsersRound } from "lucide-react";
import LogoutButton from "@/components/auth/logout-button";

const navigation = [
  { href: "/admin/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/admin/classes", label: "Niveaux & groupes", icon: BookOpenCheck },
  { href: "/admin/students", label: "Élèves", icon: UsersRound },
  { href: "/admin/payments", label: "Paiements", icon: Banknote },
  { href: "/admin/scan", label: "Scanner QR", icon: QrCode },
  { href: "/admin/settings", label: "Paramètres", icon: Settings },
];

export default async function AdminShell({ name, children }: { name: string; children: React.ReactNode }) {
  const { t } = await getTranslation();
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-7 lg:px-10">
          <div className="flex items-center gap-3">
            <Image src="/nour-logo.png" alt="Logo NOUR" width={40} height={60} className="h-10 w-7 object-contain" />
            <div><p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{t("Administration ·")} {name}</p></div>
          </div>
          <LogoutButton />
        </div>
        <nav aria-label={t("Navigation administration")} className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 sm:px-7 lg:px-10">
          {navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-600 transition hover:bg-primary-soft hover:text-primary"><Icon size={16} />{t(label)}</Link>)}
        </nav>
      </header>
      <div>{children}</div>
    </div>
  );
}
