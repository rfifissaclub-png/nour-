import { getTranslation } from "@/lib/i18n/server";
import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowUpRight, BookOpen, Check, GraduationCap, ShieldCheck, Sparkles } from "lucide-react";
import LoginForm from "@/components/auth/login-form";
import { readSession } from "@/lib/auth/session";
import { BLOCKED_MESSAGE, COOKIE_NAME, HOME } from "@/lib/auth/constants";
export const dynamic = "force-dynamic";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string; identifier?: string }> }) {
  const { t } = await getTranslation();
  const params = await searchParams;
  const session = await readSession((await cookies()).get(COOKIE_NAME)?.value);
  if (session.status === "authenticated") redirect(HOME[session.user.role]);
  const message = session.status === "blocked" || params.reason === "blocked" ? BLOCKED_MESSAGE : "";
  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[0.95fr_1.05fr]">
      <aside className="relative hidden min-h-screen overflow-hidden bg-[#0736A6] p-12 text-white lg:flex lg:flex-col xl:p-16">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,#4364F7_0%,transparent_65%)]" />
        <div className="nour-grid absolute inset-0 opacity-15" />
        <div className="pointer-events-none absolute -bottom-40 -left-36 h-[540px] w-[540px] rounded-full border border-white/15" />
        <div className="pointer-events-none absolute -bottom-24 -left-20 h-[410px] w-[410px] rounded-full border border-white/15" />
        <div className="relative flex items-center gap-3 text-sm font-semibold tracking-wide"><span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10"><GraduationCap size={24} /></span>{t("NOUR · L’ESPACE APPRENANT")}</div>
        <div className="relative my-auto py-16">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-medium"><Sparkles size={14} className="text-amber-300" /> {t("Chaque effort éclaire votre avenir")}</div>
          <h1 className="max-w-lg text-5xl font-semibold leading-[1.13] tracking-[-0.045em] xl:text-6xl">{t("Un pas de plus")}<br />{t("vers")} <span className="text-[#B9D7FF]">{t("la réussite.")}</span></h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-blue-100">{t("Vos cours, vos ressources et votre suivi scolaire. Tout commence ici.")}</p>
          <div className="mt-11 max-w-sm rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl shadow-blue-950/10 backdrop-blur-sm">
            <div className="flex items-start justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-primary"><BookOpen size={25} /></span><ArrowUpRight className="text-blue-200" size={20} /></div>
            <p className="mt-6 text-lg font-semibold">{t("Apprendre. S’entraîner. Avancer.")}</p>
            <p className="mt-2 text-sm leading-6 text-blue-100">{t("Un espace personnel pour rester connecté à votre centre.")}</p>
            <div className="mt-5 flex flex-wrap gap-2">{[t("Cours & séries"), t("Suivi personnel")].map(text => <span key={text} className="inline-flex items-center gap-1.5 rounded-full bg-blue-950/20 px-3 py-1.5 text-xs"><Check size={12} className="text-amber-300" />{text}</span>)}</div>
          </div>
        </div>
        <div className="relative flex items-center justify-between border-t border-white/15 pt-6 text-xs text-blue-100"><span>{t("Centre de soutien scolaire")}</span><span lang="ar" dir="rtl" className="text-base">معاً نحو النجاح</span></div>
      </aside>
      <section aria-label={t("Connexion à votre espace")} className="flex min-h-screen flex-col px-6 pb-safe-bottom pt-safe-top sm:px-10 lg:px-14">
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-9 sm:py-12">
          <div className="mb-10 flex items-center gap-4">
            <Image src="/nour-logo.png" alt="Logo NOUR" width={56} height={86} priority className="h-[86px] w-14 object-contain" />
            <div><p className="text-3xl font-extrabold tracking-[-0.04em] text-primary">NOUR<span className="text-accent">.</span></p><p className="mt-1 text-xs font-medium tracking-wide text-slate-500">{t("CENTRE DE SOUTIEN SCOLAIRE")}</p></div>
          </div>
          <div className="mb-8"><p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">{t("Votre espace personnel")}</p><h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-[34px]">{t("Heureux de vous revoir")}<span className="text-primary">.</span></h2><p className="mt-3 text-sm leading-6 text-slate-500">{t("Connectez-vous pour retrouver votre espace NOUR.")}</p></div>
          <LoginForm initialMessage={t(message)} initialIdentifier={params.identifier} />
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500"><ShieldCheck size={15} className="text-primary" />{t("Votre accès est personnel et sécurisé")}</div>
        </div>
        <footer className="mx-auto flex w-full max-w-[420px] items-center justify-between border-t border-slate-200 py-5 text-[11px] text-slate-500"><span>© {new Date().getFullYear()} NOUR</span><span>{t("Votre réussite, notre engagement.")}</span></footer>
      </section>
    </main>
  );
}
