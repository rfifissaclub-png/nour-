"use client";
import { useTranslation } from "@/components/i18n/language-provider";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CalendarDays, Check, CircleDollarSign, MessageCircle, Search, UsersRound, X } from "lucide-react";
import { updateStudentPayment } from "@/app/admin/payments/actions";
import { allocatePaymentLineCents, calculateTeacherShareCents, moneyToCents, sumMoneyCents } from "@/lib/payments/finance";
import { useOfflineBackup } from "@/hooks/use-offline-backup";
import { matchesSearch } from "@/lib/search";
import { currentMoroccoPeriod, shiftPeriod } from "@/lib/payments/period";
import PaymentHistory from "./payment-history";
import OfflineBanner from "./offline-banner";

export type PaymentGroup = {
  id: string;
  name: string;
  levelId: string;
  levelName: string;
  teacherId: string;
  teacherName: string;
  amount: string;
  teacherPercentage: string;
};

type PaymentLine = {
  groupId: string;
  levelId: string;
  groupName: string;
  teacherId: string;
  teacherName: string;
  amount: string;
  teacherPercentage: string;
};

type PaymentRecord = {
  id: string;
  totalAmount: string;
  paidAmount: string;
  status: "PAID" | "PARTIAL" | "UNPAID";
  lines: PaymentLine[];
};

type Student = {
  id: string;
  fullName: string;
  codeId: string;
  phone: string | null;
  isActive?: boolean;
  groups: PaymentGroup[];
  payment: PaymentRecord | null;
};

export type PaymentPageData = {
  year: number;
  month: number;
  selectedLevelId: string;
  levels: { id: string; name: string }[];
  students: Student[];
};

type BillingStudent = Student & {
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  status: "PAID" | "PARTIAL" | "UNPAID";
  lines: PaymentLine[];
  linePaidCents: number[];
  visibleCents: number;
  visiblePaidCents: number;
};

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const ARABIC_MONTH_NAMES = [
  "يناير", "فبراير", "مارس", "أبريل", "ماي", "يونيو",
  "يوليوز", "غشت", "شتنبر", "أكتوبر", "نونبر", "دجنبر",
];
const PAYMENT_PAGE_SIZE = 30;

function cents(value: string | number): number {
  return moneyToCents(value);
}

function money(value: number): string {
  return new Intl.NumberFormat("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
}

function getBillingStudent(student: Student, selectedLevelId: string): BillingStudent {
  const lines = student.payment
    ? student.payment.lines
    : student.groups.map(group => ({
      groupId: group.id,
      levelId: group.levelId,
      groupName: group.name,
      teacherId: group.teacherId,
      teacherName: group.teacherName,
      amount: group.amount,
      teacherPercentage: group.teacherPercentage,
    }));
  const totalCents = student.payment ? cents(student.payment.totalAmount) : sumMoneyCents(lines.map(line => line.amount));
  const paidCents = student.payment ? cents(student.payment.paidAmount) : 0;
  const status = student.payment?.status ?? (totalCents === 0 ? "PAID" : "UNPAID");
  const linePaidCents = allocatePaymentLineCents(paidCents, totalCents, lines.map(line => cents(line.amount)));
  const visibleIds = new Set([
    ...student.groups.filter(group => !selectedLevelId || group.levelId === selectedLevelId).map(group => group.id),
    ...lines.filter(line => !selectedLevelId || line.levelId === selectedLevelId).map(line => line.groupId),
  ]);
  const visibleLines = lines.filter(line => visibleIds.has(line.groupId) && (!selectedLevelId || line.levelId === selectedLevelId));
  const visibleCents = visibleLines.reduce((sum, line) => sum + cents(line.amount), 0);
  const visiblePaidCents = lines.reduce((sum, line, index) => sum + (
    visibleIds.has(line.groupId) && (!selectedLevelId || line.levelId === selectedLevelId) ? linePaidCents[index] : 0
  ), 0);

  return {
    ...student,
    totalCents,
    paidCents,
    remainingCents: Math.max(0, totalCents - paidCents),
    status,
    lines,
    linePaidCents,
    visibleCents,
    visiblePaidCents,
  };
}

export default function PaymentsManager({ scope, data: initialData }: { scope: string; data: PaymentPageData }) {
  const { t } = useTranslation();
  const router = useRouter();
  const monthValue = `${initialData.year}-${String(initialData.month).padStart(2, "0")}`;
  const cacheKey = `payments:${monthValue}:${initialData.selectedLevelId || "all"}`;
  const endpoint = `/api/backup/data?view=payments&month=${monthValue}&level=${encodeURIComponent(initialData.selectedLevelId)}`;
  const offline = useOfflineBackup(scope, cacheKey, endpoint, initialData);
  const data = offline.isUsingCachedData || offline.isOffline
    ? offline.cachedData ?? initialData
    : initialData;
  const [tab, setTab] = useState<"payments" | "teachers">("payments");
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const filtered = useMemo(
    () => data.students
      .map(student => getBillingStudent(student, data.selectedLevelId))
      .filter(student => data.selectedLevelId
        ? student.groups.some(group => group.levelId === data.selectedLevelId) || student.lines.some(line => line.levelId === data.selectedLevelId)
        : student.groups.length > 0 || student.lines.length > 0),
    [data],
  );
  const searchResults = useMemo(() => {
    return filtered.filter(student => (!statusFilter || student.status === statusFilter)
      && matchesSearch(search, student.fullName, student.codeId, student.phone, ...student.lines.map(line => line.groupName)));
  }, [filtered, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(searchResults.length / PAYMENT_PAGE_SIZE));
  const visibleStudents = searchResults.slice((page - 1) * PAYMENT_PAGE_SIZE, page * PAYMENT_PAGE_SIZE);
  useEffect(() => {
    setPage(1);
  }, [data.year, data.month, data.selectedLevelId, search, statusFilter]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const stats = useMemo(() => searchResults.reduce((result, student) => {
    result.received += student.visiblePaidCents;
    result.remaining += Math.max(0, student.visibleCents - student.visiblePaidCents);
    result[student.status] += 1;
    return result;
  }, { received: 0, remaining: 0, PAID: 0, PARTIAL: 0, UNPAID: 0 }), [searchResults]);

  const payroll = useMemo(() => {
    const teachers = new Map<string, { teacherId: string; teacherName: string; students: Set<string>; earnedCents: number }>();
    for (const student of data.students) {
      const billing = getBillingStudent(student, "");
      if (billing.totalCents <= 0 || billing.paidCents <= 0) continue;
      for (const [index, line] of billing.lines.entries()) {
        if (data.selectedLevelId && line.levelId !== data.selectedLevelId) continue;
        const groupPaidCents = billing.linePaidCents[index];
        if (groupPaidCents <= 0) continue;
        const row = teachers.get(line.teacherId) ?? {
          teacherId: line.teacherId,
          teacherName: line.teacherName,
          students: new Set<string>(),
          earnedCents: 0,
        };
        row.students.add(student.id);
        row.earnedCents += calculateTeacherShareCents(groupPaidCents, line.teacherPercentage);
        teachers.set(line.teacherId, row);
      }
    }
    return [...teachers.values()].sort((a, b) => b.earnedCents - a.earnedCents);
  }, [data.students, data.selectedLevelId]);

  function changeFilters(monthValue: string, levelId: string) {
    const [year, month] = monthValue.split("-");
    if (!/^\d{4}$/.test(year) || !/^(0[1-9]|1[0-2])$/.test(month)) return;
    const query = new URLSearchParams({ month: monthValue });
    if (levelId) query.set("level", levelId);
    router.push(`/admin/payments?${query.toString()}`);
  }

  function update(studentId: string, mode: "PAID" | "PARTIAL" | "UNPAID", amount?: string) {
    setNotice("");
    startTransition(async () => {
      try {
        const result = await updateStudentPayment(studentId, data.year, data.month, mode, amount);
        if (!result.ok) {
          setNotice(result.message);
          return;
        }
        setNotice(t("Le règlement a été enregistré."));
        router.refresh();
      } catch {
        setNotice(t("Le règlement n’a pas pu être enregistré. Vérifiez la connexion et réessayez."));
      }
    });
  }

  const levelName = data.levels.find(level => level.id === data.selectedLevelId)?.name ?? t("Tous les niveaux");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-7 lg:px-10 lg:py-10">
      <header className="mb-7">
        <p className="text-sm font-semibold text-primary">{t("Suivi financier NOUR")}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{t("Paiements & paie des profs")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{t("Suivez les règlements mensuels, les avances et les parts dues aux professeurs sur les montants réellement encaissés.")}</p>
      </header>

      {(offline.isOffline || offline.isUsingCachedData) && <OfflineBanner lastUpdatedAt={offline.lastUpdatedAt} />}
      {(offline.isOffline || offline.isUsingCachedData) && <p className="mb-4 text-xs font-medium text-amber-900">{t("Mode lecture seule : les changements de paiement nécessitent une connexion.")}</p>}

      <section aria-label={t("Période et niveau")} className="mb-6 grid gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5">
        <div><label htmlFor="payment-month" className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700"><CalendarDays size={16} className="text-primary" />{t("Mois de facturation")}</label><input id="payment-month" type="month" min="2000-01" max="9999-12" value={monthValue} disabled={offline.isOffline || offline.isUsingCachedData} onChange={event => changeFilters(event.target.value, data.selectedLevelId)} className="field-control disabled:bg-slate-100" /></div>
        <div><label htmlFor="payment-level" className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700"><UsersRound size={16} className="text-primary" />{t("Niveau scolaire")}</label><select id="payment-level" value={data.selectedLevelId} disabled={offline.isOffline || offline.isUsingCachedData} onChange={event => changeFilters(monthValue, event.target.value)} className="field-control disabled:bg-slate-100"><option value="">{t("Tous les niveaux")}</option>{data.levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}</select></div>
      </section>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-xl border bg-white px-3 py-2 text-sm disabled:opacity-40" disabled={pending || offline.isOffline || offline.isUsingCachedData || monthValue === "2000-01"} onClick={() => changeFilters(shiftPeriod(monthValue, -1), data.selectedLevelId)}>{t("Mois précédent")}</button>
        <button type="button" className="rounded-xl border bg-white px-3 py-2 text-sm disabled:opacity-40" disabled={pending || offline.isOffline || offline.isUsingCachedData} onClick={() => { const period = currentMoroccoPeriod(); changeFilters(`${period.year}-${String(period.month).padStart(2, "0")}`, data.selectedLevelId); }}>{t("Mois actuel")}</button>
        <button type="button" className="rounded-xl border bg-white px-3 py-2 text-sm disabled:opacity-40" disabled={pending || offline.isOffline || offline.isUsingCachedData || monthValue === "9999-12"} onClick={() => changeFilters(shiftPeriod(monthValue, 1), data.selectedLevelId)}>{t("Mois suivant")}</button>
        <p className="w-full text-xs text-slate-500">{t("Sélectionnez un mois passé pour régulariser un paiement ou un mois à venir pour enregistrer une avance. Chaque mois est indépendant.")}</p>
      </div>
      <section aria-label={t("Statistiques des paiements")} className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard icon={<CircleDollarSign size={19} />} label={t("Total encaissé")} value={`${money(stats.received)} MAD`} description={`${MONTH_NAMES[data.month - 1]} ${data.year} · ${levelName}`} color="green" />
        <StatCard icon={<Banknote size={19} />} label={t("Reste à payer")} value={`${money(stats.remaining)} MAD`} description={t("Montant restant des factures affichées")} color="amber" />
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-sm font-medium text-slate-600"><UsersRound size={17} />{t("Élèves")}</div><div className="mt-3 flex flex-wrap gap-2"><CountBadge count={stats.PAID} label={t("Payé")} tone="green" /><CountBadge count={stats.PARTIAL} label={t("Avance")} tone="lime" /><CountBadge count={stats.UNPAID} label={t("Impayé")} tone="red" /></div></div>
      </section>

      <div className="mb-5 flex gap-2 border-b border-slate-200" role="tablist" aria-label={t("Sections financières")}>
        <button id="tab-payments" type="button" role="tab" aria-selected={tab === "payments"} aria-controls="panel-payments" onClick={() => setTab("payments")} className={`min-h-11 border-b-2 px-4 text-sm font-semibold ${tab === "payments" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{t("Paiements des élèves")}</button>
        <button id="tab-teachers" type="button" role="tab" aria-selected={tab === "teachers"} aria-controls="panel-teachers" onClick={() => setTab("teachers")} className={`min-h-11 border-b-2 px-4 text-sm font-semibold ${tab === "teachers" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{t("Part des profs")}</button>
      </div>

      {notice && <p role="status" className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">{t(notice)}</p>}

      {tab === "payments" ? (
        <section id="panel-payments" role="tabpanel" aria-labelledby="tab-payments" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-semibold text-slate-950">{t("Règlements mensuels")}</h2><p className="mt-1 text-xs text-slate-500">{t("Le tarif correspond à la somme des groupes inscrits, figée lors du premier règlement.")}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{searchResults.length} {t("élève")}{searchResults.length === 1 ? "" : "s"}</span></div>
          <div className="border-b border-slate-100 px-5 py-4">
            <label htmlFor="payment-student-search" className="sr-only">{t("Rechercher par nom, Code ID, téléphone ou matière")}</label>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <label htmlFor="payment-status" className="text-sm">{t("Statut du paiement")}</label>
              <select id="payment-status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="field-control max-w-xs"><option value="">{t("Tous les statuts")}</option><option value="PAID">{t("Payé")}</option><option value="PARTIAL">{t("Avance")}</option><option value="UNPAID">{t("Impayé")}</option></select>
              <button type="button" onClick={() => { setSearch(""); setStatusFilter(""); }} className="text-sm font-medium text-primary">{t("Réinitialiser les filtres")}</button>
            </div>
            <div className="relative max-w-xl">
              <Search size={17} aria-hidden="true" className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="payment-student-search" type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder={t("Rechercher par nom, Code ID, téléphone ou matière…")} className="field-control ps-10 pe-10" />
              {search && <button type="button" aria-label={t("Effacer la recherche de paiements")} onClick={() => { setSearch(""); setPage(1); }} className="absolute end-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X size={16} /></button>}
            </div>
          </div>
          {searchResults.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{filtered.length === 0 ? t("Aucun élève inscrit dans ce niveau.") : t("Aucun élève ne correspond à cette recherche.")}</p> : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-start text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th scope="col" className="px-5 py-3">{t("Élève")}</th><th scope="col" className="px-5 py-3">{t("Groupes")}</th><th scope="col" className="px-5 py-3 text-end">{t("À payer")}</th><th scope="col" className="px-5 py-3 text-end">{t("Payé")}</th><th scope="col" className="px-5 py-3">{t("Statut")}</th><th scope="col" className="px-5 py-3">{t("Actions")}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{visibleStudents.map(student => <PaymentRow key={`${student.id}:${data.year}-${data.month}`} student={student} year={data.year} month={data.month} pending={pending || offline.isOffline || offline.isUsingCachedData || student.isActive === false} onUpdate={update} onHistory={() => setHistoryStudent(student)} />)}</tbody>
              </table>
            </div>
            {pageCount > 1 && <nav aria-label={t("Pagination des paiements")} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
              <p className="text-xs text-slate-500">{t("Élèves")} {(page - 1) * PAYMENT_PAGE_SIZE + 1}–{Math.min(page * PAYMENT_PAGE_SIZE, searchResults.length)} {t("sur")} {searchResults.length}</p>
              <div className="flex items-center gap-2">
                <button type="button" disabled={page === 1} onClick={() => setPage(current => current - 1)} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 disabled:opacity-40">{t("Précédent")}</button>
                <span aria-live="polite" className="text-xs font-medium text-slate-600">{t("Page")} {page} / {pageCount}</span>
                <button type="button" disabled={page === pageCount} onClick={() => setPage(current => current + 1)} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 disabled:opacity-40">{t("Suivant")}</button>
              </div>
            </nav>}
            </>
          )}
        </section>
      ) : (
        <section id="panel-teachers" role="tabpanel" aria-labelledby="tab-teachers" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-950">{t("Part des professeurs")}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{t("Calculée au prorata des montants encaissés sur les factures détaillées, selon la commission figée au moment de la facturation.")}</p></div>
          {payroll.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{t("Aucun montant encaissé pour cette période.")}</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-start text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th scope="col" className="px-5 py-3">{t("Professeur")}</th><th scope="col" className="px-5 py-3">{t("Élèves concernés")}</th><th scope="col" className="px-5 py-3 text-end">{t("Part calculée")}</th><th scope="col" className="px-5 py-3 text-end">{t("Période")}</th></tr></thead><tbody className="divide-y divide-slate-100">{payroll.map(teacher => <tr key={teacher.teacherId}><td className="px-5 py-4 font-medium text-slate-900">{teacher.teacherName}</td><td className="px-5 py-4 text-slate-600">{teacher.students.size}</td><td className="px-5 py-4 text-end font-semibold text-slate-900">{money(teacher.earnedCents)} {t("MAD")}</td><td className="px-5 py-4 text-end text-slate-600">{t(MONTH_NAMES[data.month - 1])} {data.year}</td></tr>)}</tbody><tfoot className="bg-slate-50"><tr><th scope="row" colSpan={2} className="px-5 py-4 text-start font-semibold text-slate-700">{t("Total des parts calculées")}</th><td className="px-5 py-4 text-end font-bold text-primary">{money(payroll.reduce((sum, teacher) => sum + teacher.earnedCents, 0))} {t("MAD")}</td><td /></tr></tfoot></table></div>
          )}
        </section>
      )}
      {historyStudent && <PaymentHistory
        student={historyStudent}
        initialYear={data.year}
        currentMonthlyTotalCents={sumMoneyCents(historyStudent.groups.map(group => group.amount))}
        onClose={() => setHistoryStudent(null)}
        onSelect={value => { setSearch(historyStudent.codeId); setHistoryStudent(null); changeFilters(value, data.selectedLevelId); }}
      />}
    </main>
  );
}

function PaymentRow({ student, year, month, pending, onUpdate, onHistory }: {
  student: BillingStudent;
  year: number;
  month: number;
  pending: boolean;
  onHistory: () => void;
  onUpdate: (studentId: string, mode: "PAID" | "PARTIAL" | "UNPAID", amount?: string) => void;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const displayedGroups = student.lines.length
    ? student.lines.map(line => ({ id: line.groupId, name: line.groupName }))
    : student.groups;
  const remaining = student.remainingCents;
  const whatsappUrl = student.phone && remaining > 0
    ? `https://wa.me/${student.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`السلام عليكم ${student.fullName}، كنذكروكم بواجبات شهر ${ARABIC_MONTH_NAMES[month - 1]} ${year} بمركز NOUR. المبلغ المتبقي هو ${money(remaining)} درهم. شكراً على ثقتكم، ومرحبا بكم.`)}`
    : null;

  return (
    <tr>
      <th scope="row" className="px-5 py-4 align-top font-normal"><p className="font-semibold text-slate-900">{student.fullName}</p><p className="mt-1 font-mono text-xs text-primary">{student.codeId}</p></th>
      <td className="max-w-[240px] px-5 py-4 align-top"><div className="flex flex-wrap gap-1">{displayedGroups.map(group => <span key={group.id} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{group.name}</span>)}</div></td>
      <td className="px-5 py-4 text-end align-top font-medium text-slate-900">{money(student.totalCents)} {t("MAD")}</td>
      <td className="px-5 py-4 text-end align-top text-slate-700">{money(student.paidCents)} {t("MAD")}{student.status === "PARTIAL" && <p className="mt-1 text-xs text-amber-700">{t("Reste")} {money(remaining)} {t("MAD")}</p>}</td>
      <td className="px-5 py-4 align-top"><StatusBadge status={student.status} /></td>
      <td className="px-5 py-4 align-top">
        <div className="flex min-w-[280px] flex-wrap items-center gap-2">
          <button type="button" disabled={pending} onClick={onHistory} className="min-h-9 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-primary disabled:opacity-50">{t("Historique")}</button>
          {student.status !== "PAID" && <button type="button" disabled={pending || student.totalCents === 0} onClick={() => onUpdate(student.id, "PAID")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-green-600 px-2.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"><Check size={14} />{t("Payé")}</button>}
          {student.status !== "PAID" && student.totalCents > 0 && <form onSubmit={event => { event.preventDefault(); onUpdate(student.id, "PARTIAL", amount); }} className="flex items-center gap-1.5"><label className="sr-only" htmlFor={`partial-${student.id}`}>{t("Total déjà versé pour")} {student.fullName}</label><input id={`partial-${student.id}`} type="number" min="0.01" max={(student.totalCents - 1) / 100} step="0.01" required disabled={pending} value={amount} onChange={event => setAmount(event.target.value)} placeholder={t("Total versé MAD")} title={t("Montant total déjà encaissé pour ce mois, et non un versement supplémentaire.")} className="h-9 w-28 rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-slate-100" /><button type="submit" disabled={pending} className="min-h-9 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50">{t("Valider")}</button></form>}
          {student.status !== "UNPAID" && student.totalCents > 0 && <button type="button" disabled={pending} onClick={() => { if (window.confirm(t("Remettre ce paiement à zéro ? Le montant encaissé pour ce mois sera effacé."))) onUpdate(student.id, "UNPAID"); }} className="min-h-9 rounded-lg border border-red-100 px-2.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">{t("Impayé")}</button>}
          {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label={`Rappel WhatsApp pour ${student.fullName}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-green-600 px-2.5 text-xs font-semibold text-white hover:bg-green-700"><MessageCircle size={14} />{t("Rappel WhatsApp")}</a>}
          {remaining > 0 && !student.phone && <span className="text-xs text-slate-500">{t("Téléphone absent")}</span>}
        </div>
      </td>
    </tr>
  );
}

function StatCard({ icon, label, value, description, color }: { icon: React.ReactNode; label: string; value: string; description: string; color: "green" | "amber" }) {
  const { t } = useTranslation();
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-sm font-medium text-slate-600"><span className={color === "green" ? "text-green-700" : "text-amber-700"}>{icon}</span>{t(label)}</div><p className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{description}</p></div>;
}

function CountBadge({ count, label, tone }: { count: number; label: string; tone: "green" | "lime" | "red" }) {
  const { t } = useTranslation();
  const colors = { green: "bg-green-50 text-green-800", lime: "bg-lime-50 text-lime-800", red: "bg-red-50 text-red-800" };
  return <span className={`rounded-full px-2.5 py-1.5 text-xs font-semibold ${colors[tone]}`}>{count} {t(label)}</span>;
}

function StatusBadge({ status }: { status: "PAID" | "PARTIAL" | "UNPAID" }) {
  const { t } = useTranslation();
  const config = {
    PAID: { label: "Payé", style: "bg-green-50 text-green-800" },
    PARTIAL: { label: "Avance", style: "bg-lime-50 text-lime-800" },
    UNPAID: { label: "Impayé", style: "bg-red-50 text-red-800" },
  }[status];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${config.style}`}>{t(config.label)}</span>;
}
