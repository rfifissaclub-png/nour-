"use client";
import { useTranslation } from "@/components/i18n/language-provider";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Printer, Share2, X } from "lucide-react";

export type AccessCardData = {
  fullName: string;
  codeId: string;
  pin: string;
  qrToken: string;
  groups: string[];
  phone?: string | null;
};

export default function AccessCardModal({ credentials, onClose }: { credentials: AccessCardData; onClose: () => void }) {
  const { t } = useTranslation();
  const [copyMessage, setCopyMessage] = useState("");
  const shareText = `Centre NOUR — Carte d’accès\nÉlève : ${credentials.fullName}\nCode ID : ${credentials.codeId}\nPIN : ${credentials.pin}\nMatières : ${credentials.groups.join(", ") || "Aucune"}\nConnexion : ${typeof window === "undefined" ? "" : window.location.origin + "/login"}`;

  async function copyCredentials() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopyMessage(t("Les informations ont été copiées. Partagez-les uniquement avec l’élève ou son parent."));
    } catch {
      setCopyMessage("Copie impossible dans ce navigateur. Utilisez le bouton WhatsApp ou recopiez la carte.");
    }
  }

  function shareWhatsApp() {
    const phone = credentials.phone?.replace(/\D/g, "");
    if (!phone) return;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="access-card-title" className="my-auto w-full max-w-lg rounded-3xl bg-white p-4 shadow-2xl sm:p-6">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div><h2 id="access-card-title" className="text-lg font-semibold text-slate-950">{t("Carte d’accès NOUR")}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{t("Conservez et partagez ces identifiants de façon confidentielle.")}</p></div>
          <button type="button" onClick={onClose} aria-label={t("Fermer la carte")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </header>
        <article className="access-card-print overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-white via-blue-50 to-indigo-50 p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3 border-b border-blue-100 pb-4">
            <div><p className="text-xl font-extrabold tracking-tight text-primary">NOUR<span className="text-amber-500">.</span></p><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">{t("Centre de soutien scolaire")}</p></div>
            <div className="rounded-full border border-blue-100 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">{t("Carte élève")}</div>
          </div>
          <div className="mt-5 grid grid-cols-[1fr_auto] items-center gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t("Nom de l’élève")}</p>
              <h3 className="mt-1 break-words text-xl font-bold leading-tight text-slate-950">{credentials.fullName}</h3>
              <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t("Code ID")}</p>
              <p className="mt-1 font-mono text-lg font-bold tracking-wide text-primary">{credentials.codeId}</p>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t("PIN confidentiel")}</p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-[0.25em] text-slate-900" dir="ltr">{credentials.pin}</p>
            </div>
            <div className="rounded-2xl border border-white bg-white p-2 shadow-sm"><QRCodeSVG value={credentials.qrToken} size={104} level="M" includeMargin aria-label={`QR code d’accès signé pour ${credentials.codeId}`} /></div>
          </div>
          <div className="mt-5 border-t border-blue-100 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t("Matières")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{credentials.groups.length ? credentials.groups.map((group, index) => <span key={`${group}-${index}`} className="rounded-full border border-blue-100 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">{group}</span>) : <span className="text-xs text-slate-500">{t("Aucune matière inscrite")}</span>}</div>
          </div>
          <p className="mt-4 text-[10px] leading-4 text-slate-500">{t("Le QR code d’accès est signé et vérifié par le centre. Le PIN n’est pas contenu dans le QR code.")}</p>
        </article>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Printer size={15} />{t("Imprimer")}</button>
          <button type="button" onClick={() => void copyCredentials()} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Copy size={15} />{t("Copier")}</button>
          <button type="button" onClick={shareWhatsApp} disabled={!credentials.phone} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-green-600 text-xs font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"><Share2 size={15} />WhatsApp</button>
        </div>
        {!credentials.phone && <p className="mt-2 text-center text-xs text-slate-500">{t("Téléphone absent")}</p>}
        {copyMessage && <p role="status" className="mt-3 text-xs leading-5 text-slate-600">{t(copyMessage)}</p>}
        <p className="mt-3 text-center text-[11px] leading-5 text-amber-800">{t("Ne partagez pas cette carte dans un groupe public. Le PIN est une information d’accès personnelle.")}</p>
      </section>
    </div>
  );
}
