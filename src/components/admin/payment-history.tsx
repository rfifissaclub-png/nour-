"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/components/i18n/language-provider";
import { Check, History, LoaderCircle } from "lucide-react";
import { registerHistoricalPayments } from "@/app/admin/payments/actions";
import { moneyToCents } from "@/lib/payments/finance";
import { currentMoroccoPeriod } from "@/lib/payments/period";
type Record = { month: number; totalAmount: string; paidAmount: string; status: "PAID" | "PARTIAL" | "UNPAID" };
export default function PaymentHistory({ student, initialYear, currentMonthlyTotalCents, onClose, onSelect }: {
  student: { id: string; fullName: string };
  initialYear: number;
  currentMonthlyTotalCents: number;
  onClose: () => void;
  onSelect: (month: string) => void;
}) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [year, setYear] = useState(initialYear);
  const [records, setRecords] = useState<Record[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [savePending, startSave] = useTransition();
  const { currentYear, currentMonth } = (() => {
    const period = currentMoroccoPeriod();
    return { currentYear: period.year, currentMonth: period.month };
  })();
  const monthLabels = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, index, 15))),
  );
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => {
    const abort = new AbortController();
    setRecords(null); setError(false); setSelectedMonths([]);
    fetch(`/api/admin/students/${student.id}/payments?year=${year}`, { signal: abort.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("Request failed"); return response.json(); })
      .then(data => { if (!abort.signal.aborted) setRecords(data.payments); })
      .catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => abort.abort();
  }, [student.id, year, retry]);
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "MAD" }).format(cents / 100);
  const selectedTotal = records
    ? selectedMonths.reduce((sum, month) => {
      const record = records.find(item => item.month === month);
      return sum + (record ? moneyToCents(record.totalAmount) : currentMonthlyTotalCents);
    }, 0)
    : 0;

  function toggleMonth(month: number, checked: boolean) {
    setSelectedMonths(current => checked
      ? [...current, month].sort((a, b) => a - b)
      : current.filter(value => value !== month));
    setSaveMessage("");
  }

  function saveHistoricalPayments() {
    if (!selectedMonths.length || savePending) return;
    const selectedLabels = selectedMonths.map(month => monthLabels[month - 1]).join(", ");
    const confirmMessage = `${t("Confirmer l’enregistrement des mois sélectionnés comme entièrement payés ?")}\n${selectedLabels} ${year}\n${t("Les factures déjà existantes conservent leur montant; les nouvelles utilisent le tarif mensuel actuel.")}\n${t("Total à enregistrer")} : ${money(selectedTotal)}`;
    if (!window.confirm(confirmMessage)) return;
    startSave(async () => {
      try {
        const result = await registerHistoricalPayments(student.id, year, selectedMonths);
        if (!result.ok) {
          setSaveMessage(t(result.message));
          return;
        }
        setSelectedMonths([]);
        setSaveMessage(t("Les paiements historiques ont été enregistrés."));
        setRetry(value => value + 1);
        router.refresh();
      } catch {
        setSaveMessage(t("Impossible d’enregistrer les paiements historiques. Vérifiez la connexion et réessayez."));
      }
    });
  }
  return <dialog ref={dialog} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="history-title" className="m-auto max-h-[90dvh] w-[min(95vw,48rem)] overflow-auto rounded-3xl p-0 shadow-xl backdrop:bg-slate-950/60">
    <div className="p-5 sm:p-7">
      <div className="flex items-start justify-between gap-3"><div><h2 id="history-title" className="text-xl font-semibold">{t("Historique des paiements")}</h2><p className="mt-1 text-sm text-slate-600">{student.fullName}</p></div><button type="button" autoFocus onClick={onClose} className="rounded-lg border px-3 py-2">{t("Fermer")}</button></div>
      <div className="my-5 flex items-center justify-between gap-3"><button type="button" disabled={year <= 2000} onClick={() => { setSelectedMonths([]); setSaveMessage(""); setYear(value => value - 1); }} className="rounded-lg border px-3 py-2 disabled:opacity-40">{t("Année précédente")}</button><span aria-live="polite" className="text-lg font-bold">{year}</span><button type="button" disabled={year >= 9999} onClick={() => { setSelectedMonths([]); setSaveMessage(""); setYear(value => value + 1); }} className="rounded-lg border px-3 py-2 disabled:opacity-40">{t("Année suivante")}</button></div>
      <p className="mb-4 text-sm text-slate-500">{t("Cochez les mois déjà réglés avant le démarrage de l’application, puis confirmez leur enregistrement.")}</p>
      {error ? <div role="alert"><p>{t("Impossible de charger l’historique. Vérifiez la connexion.")}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-3 rounded-lg border px-3 py-2">{t("Réessayer")}</button></div> : records === null ? <p role="status">{t("Chargement…")}</p> : <>
        <div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead><tr className="border-b text-slate-500"><th className="py-3 text-start">{t("Payé avant l’application")}</th><th className="text-start">{t("Mois de facturation")}</th><th className="text-start">{t("Statut")}</th><th className="text-end">{t("Payé")}</th><th className="text-end">{t("Reste à payer")}</th></tr></thead><tbody>
          {Array.from({ length: 12 }, (_, index) => {
            const month = index + 1; const record = records.find(item => item.month === month);
            const isPaid = record?.status === "PAID";
            const isFuture = year > currentYear || (year === currentYear && month > currentMonth);
            const checked = isPaid || selectedMonths.includes(month);
            return <tr key={month} className="border-b">
              <td className="py-3"><input type="checkbox" checked={checked} disabled={isPaid || isFuture || savePending} aria-label={`${t("Marquer le mois comme payé")} ${monthLabels[index]} ${year}`} onChange={event => toggleMonth(month, event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary disabled:opacity-40" /></td>
              <th className="text-start font-medium"><button type="button" className="rounded text-primary underline underline-offset-4" onClick={() => onSelect(`${year}-${String(month).padStart(2, "0")}`)}>{monthLabels[index]}</button></th>
              <td>{record ? t(record.status === "PAID" ? "Payé" : record.status === "PARTIAL" ? "Avance" : "Impayé") : t("Non enregistré")}</td>
              <td className="text-end">{record ? money(moneyToCents(record.paidAmount)) : "—"}</td>
              <td className="text-end">{record ? money(Math.max(0, moneyToCents(record.totalAmount) - moneyToCents(record.paidAmount))) : "—"}</td>
            </tr>;
          })}
        </tbody></table></div>
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p>{t("Pour les mois sans facture existante, le montant enregistré sera calculé avec les tarifs actuels des matières. Les factures déjà enregistrées gardent leur montant.")}</p>
          <p className="mt-2 font-semibold">{t("Total à enregistrer")} : {money(selectedTotal)}</p>
          <button type="button" disabled={!selectedMonths.length || savePending} onClick={saveHistoricalPayments} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
            {savePending ? <LoaderCircle size={16} className="animate-spin" /> : <><History size={16} /><Check size={16} /></>}
            {savePending ? t("Enregistrement…") : t("Enregistrer les mois cochés comme payés")}
          </button>
          {saveMessage && <p role="status" className="mt-3">{saveMessage}</p>}
        </div>
        <p className="mt-4 font-semibold">{t("Total encaissé")} : {money(records.reduce((sum, record) => sum + moneyToCents(record.paidAmount), 0))}</p>
      </>}
    </div>
  </dialog>;
}
