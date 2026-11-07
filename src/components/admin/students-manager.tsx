"use client";
import { useTranslation } from "@/components/i18n/language-provider";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, BookOpen, Check, CheckCircle2, KeyRound, MessageCircle, Pencil, Search, UserPlus, X } from "lucide-react";
import { createStudent, regenerateStudentPin, updateEnrollmentPrice, updateStudentProfile, type StudentActionState } from "@/app/admin/actions";
import AccessCardModal, { type AccessCardData } from "./access-card-modal";
import { useOfflineBackup } from "@/hooks/use-offline-backup";
import { matchesSearch } from "@/lib/search";
import OfflineBanner from "./offline-banner";

type Level = { id: string; name: string };
type GroupOption = { id: string; name: string; levelId: string; levelName: string };
type StudentGroup = GroupOption & { enrollmentId: string; monthlyPrice: string };
type Student = {
  id: string;
  fullName: string;
  codeId: string;
  phone: string | null;
  isActive: boolean;
  groups: StudentGroup[];
};

const emptyState: StudentActionState = {};
const STUDENT_PAGE_SIZE = 30;

export default function StudentsManager({ scope, levels, groups, initialStudents }: { scope: string; levels: Level[]; groups: GroupOption[]; initialStudents: Student[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createStudent, emptyState);
  const initialSnapshot = useMemo(() => ({ levels, groups, students: initialStudents }), [groups, initialStudents, levels]);
  const offline = useOfflineBackup(scope, "students", "/api/backup/data?view=students", initialSnapshot);
  const displayedSnapshot = offline.isUsingCachedData || offline.isOffline
    ? offline.cachedData ?? initialSnapshot
    : initialSnapshot;
  const displayedLevels = displayedSnapshot.levels;
  const displayedGroups = displayedSnapshot.groups;
  const displayedStudents = displayedSnapshot.students;
  const [selectedLevel, setSelectedLevel] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [query, setQuery] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [credentials, setCredentials] = useState<AccessCardData | null>(null);
  const [cardError, setCardError] = useState("");
  const [cardPendingFor, setCardPendingFor] = useState<string | null>(null);
  const [newCardAvailable, setNewCardAvailable] = useState(true);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [groupPrices, setGroupPrices] = useState<Record<string, string>>({});
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [profileValues, setProfileValues] = useState<{ fullName: string; phone: string; active: boolean }>({ fullName: "", phone: "", active: true });
  const [profileError, setProfileError] = useState("");
  const [profilePending, startProfileTransition] = useTransition();
  const availableGroups = displayedGroups.filter(group => group.levelId === selectedLevel);
  const visibleGroups = displayedGroups.filter(group => !levelFilter || group.levelId === levelFilter);

  const filteredStudents = useMemo(() => {
    return displayedStudents.filter(student => {
      const matchesName = matchesSearch(query, student.fullName, student.codeId, student.phone);
      const matchesLevel = !levelFilter || student.groups.some(group => group.levelId === levelFilter);
      const matchesGroup = !groupFilter || student.groups.some(group => group.id === groupFilter);
      return matchesName && matchesLevel && matchesGroup && (!activeFilter || student.isActive === (activeFilter === "active"));
    });
  }, [displayedStudents, groupFilter, levelFilter, query, activeFilter]);
  const studentPageCount = Math.max(1, Math.ceil(filteredStudents.length / STUDENT_PAGE_SIZE));
  const visibleStudents = filteredStudents.slice((studentPage - 1) * STUDENT_PAGE_SIZE, studentPage * STUDENT_PAGE_SIZE);
  useEffect(() => {
    setStudentPage(1);
  }, [groupFilter, levelFilter, query, activeFilter]);
  useEffect(() => {
    if (studentPage > studentPageCount) setStudentPage(studentPageCount);
  }, [studentPage, studentPageCount]);

  async function showAccessCard(student: Student) {
    setCardError("");
    if (offline.isOffline) return;
    const confirmed = window.confirm(`Le PIN actuel de ${student.fullName} ne peut pas être récupéré. Continuer réinitialisera son PIN, révoquera son QR précédent et déconnectera ses sessions existantes. Voulez-vous générer une nouvelle carte ?`);
    if (!confirmed) return;
    setCardPendingFor(student.id);
    try {
      const result = await regenerateStudentPin(student.id);
      if (!result.ok) {
        setCardError(result.message);
        return;
      }
      setCredentials({ fullName: student.fullName, codeId: student.codeId, pin: result.pin, qrToken: result.qrToken, groups: student.groups.map(group => group.name), phone: student.phone });
    } catch {
      setCardError("Impossible de générer la carte pour le moment. Vérifiez la connexion et réessayez.");
    } finally {
      setCardPendingFor(null);
    }
  }

  function closeCard() {
    setCredentials(null);
  }

  function beginStudentEdit(student: Student) {
    setEditingStudentId(student.id);
    setProfileValues({ fullName: student.fullName, phone: student.phone ?? "", active: student.isActive });
    setProfileError("");
  }

  function saveStudentProfile(studentId: string) {
    setProfileError("");
    startProfileTransition(async () => {
      try {
        const result = await updateStudentProfile(studentId, {
          fullName: profileValues.fullName,
          phone: profileValues.phone,
          active: profileValues.active,
        });
        if ("error" in result && result.error) {
          setProfileError(result.error);
          return;
        }
        setEditingStudentId(null);
        setProfileError("");
        router.refresh();
      } catch {
        setProfileError("La mise à jour de l’élève a échoué. Vérifiez la connexion et réessayez.");
      }
    });
  }

  const newCredential = state.credentials;

  function shareNewStudentCredentials() {
    if (!newCredential) return;
    const phone = newCredential.phone.replace(/\D/g, "");
    const message = `السلام عليكم ${newCredential.fullName}، مرحباً بك في مركز NOUR.\n\nمعلومات الدخول الخاصة بك:\nرمز التعريف: ${newCredential.codeId}\nالرمز السري PIN: ${newCredential.pin}\nرابط الدخول: ${window.location.origin}/login\n\nاحتفظ بهذه المعلومات ولا تشاركها مع أي شخص آخر.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  useEffect(() => {
    if (newCredential) setNewCardAvailable(true);
  }, [newCredential?.codeId]);

  return (
    <>
      {(offline.isOffline || offline.isUsingCachedData) && <OfflineBanner lastUpdatedAt={offline.lastUpdatedAt} />}
      {(offline.isOffline || offline.isUsingCachedData) && <p className="mb-4 text-xs font-medium text-amber-900">{t("Mode lecture seule : les créations, paiements et changements de carte nécessitent une connexion.")}</p>}
      <section className="mb-10 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <form action={formAction} onChange={() => setNewCardAvailable(false)} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
          <div className="mb-5 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary"><UserPlus size={21} /></span><div><h2 className="font-semibold text-slate-950">{t("Créer un compte élève")}</h2><p className="mt-0.5 text-xs text-slate-500">{t("Code ID et PIN créés automatiquement.")}</p></div></div>
          <div className="space-y-4">
            <FormField id="student-name" label={t("Nom complet")}><input id="student-name" name="fullName" required maxLength={150} autoComplete="name" placeholder={t("Nom et prénom de l’élève")} className="field-control" /></FormField>
            <FormField id="student-phone" label={t("Téléphone de l’élève ou du parent")}><input id="student-phone" name="phone" required type="tel" autoComplete="tel" maxLength={80} placeholder="+212 6 12 34 56 78" className="field-control" /><p className="mt-1.5 text-xs text-slate-500">{t("Le numéro sera normalisé au format international marocain.")}</p></FormField>
            <FormField id="student-level" label={t("Niveau")}>
              <select id="student-level" name="levelId" required value={selectedLevel} onChange={event => { setSelectedLevel(event.target.value); setSelectedGroupIds([]); setGroupPrices({}); }} disabled={levels.length === 0} className="field-control">
                <option value="" disabled>{t("Choisir un niveau")}</option>
                {displayedLevels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}
              </select>
            </FormField>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">{t("Matières à suivre")}</legend>
              {!selectedLevel ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">{t("Choisissez d’abord un niveau.")}</p> : availableGroups.length === 0 ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{t("Aucun groupe n’est enregistré dans ce niveau.")}</p> : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {availableGroups.map(group => {
                    const selected = selectedGroupIds.includes(group.id);
                    return <div key={group.id} className="rounded-xl border border-slate-200 p-3">
                      <label className="flex min-h-8 cursor-pointer items-center gap-3 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          name="groupIds"
                          value={group.id}
                          checked={selected}
                          onChange={event => setSelectedGroupIds(current => event.target.checked
                            ? [...current, group.id]
                            : current.filter(id => id !== group.id))}
                          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <span>{group.name}</span>
                      </label>
                      <label htmlFor={`group-price-${group.id}`} className="mt-2 block text-xs text-slate-500">{t("Prix mensuel pour")} {group.name} (MAD)</label>
                      <input
                        id={`group-price-${group.id}`}
                        name={`groupPrice_${group.id}`}
                        type="number"
                        min="0"
                        max="99999999.99"
                        step="0.01"
                        required={selected}
                        disabled={!selected}
                        value={groupPrices[group.id] ?? ""}
                        onChange={event => setGroupPrices(current => ({ ...current, [group.id]: event.target.value }))}
                        placeholder={t("Ex. 300")}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-slate-50"
                      />
                    </div>;
                  })}
                </div>
              )}
            </fieldset>
            <p className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900"> {t("Total mensuel :")} {formatMad(selectedGroupIds.reduce((total, id) => total + (Number(groupPrices[id]) || 0), 0))} {t("MAD")} </p>
          </div>
          <FormFeedback state={state} />
          <button disabled={offline.isOffline || offline.isUsingCachedData || pending || !selectedLevel || selectedGroupIds.length === 0} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"><UserPlus size={17} />{pending ? t("Création du compte…") : t("Créer le compte élève")}</button>
          {state.success && newCredential && newCardAvailable && <button type="button" onClick={() => setCredentials({ fullName: newCredential.fullName, codeId: newCredential.codeId, pin: newCredential.pin, qrToken: newCredential.qrToken, groups: newCredential.groups })} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-blue-100"><KeyRound size={17} />{t("Afficher la carte d’accès créée")}</button>}
        </form>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-6" aria-labelledby="students-list-title">
          <div className="mb-5 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><BookOpen size={21} /></span><div><h2 id="students-list-title" className="font-semibold text-slate-950">{t("Élèves inscrits")}</h2><p className="mt-0.5 text-xs text-slate-500">{filteredStudents.length} {t("résultat")}{filteredStudents.length === 1 ? "" : "s"}</p></div></div>
          <label htmlFor="student-search" className="sr-only">{t("Rechercher par nom, Code ID ou téléphone")}</label>
          <div className="relative"><Search size={17} aria-hidden="true" className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input id="student-search" type="search" value={query} onChange={event => { setQuery(event.target.value); setStudentPage(1); }} placeholder={t("Rechercher par nom, Code ID ou téléphone…")} className="field-control ps-10 pe-10" />{query && <button type="button" aria-label={t("Effacer la recherche des élèves")} onClick={() => { setQuery(""); setStudentPage(1); }} className="absolute end-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X size={16} /></button>}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="filter-active" className="mb-1.5 block text-xs font-medium text-slate-600">{t("État du compte")}</label><select id="filter-active" value={activeFilter} onChange={event => setActiveFilter(event.target.value)} className="field-control"><option value="">{t("Tous les comptes")}</option><option value="active">{t("Actifs")}</option><option value="inactive">{t("Inactifs")}</option></select></div>
            <div><label htmlFor="filter-level" className="mb-1.5 block text-xs font-medium text-slate-600">{t("Filtrer par niveau")}</label><select id="filter-level" value={levelFilter} onChange={event => { setLevelFilter(event.target.value); setGroupFilter(""); setStudentPage(1); }} className="field-control"><option value="">{t("Tous les niveaux")}</option>{displayedLevels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}</select></div>
            <div><label htmlFor="filter-group" className="mb-1.5 block text-xs font-medium text-slate-600">{t("Filtrer par matière")}</label><select id="filter-group" value={groupFilter} onChange={event => { setGroupFilter(event.target.value); setStudentPage(1); }} className="field-control"><option value="">{t("Toutes les matières")}</option>{visibleGroups.map(group => <option key={group.id} value={group.id}>{group.name} · {group.levelName}</option>)}</select></div>
          </div>
          {cardError && <p role="alert" className="mt-3 flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800"><AlertCircle size={17} className="shrink-0" />{t(cardError)}</p>}
          <div className="mt-4 max-h-[460px] space-y-3 overflow-y-auto pr-1">
            {filteredStudents.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{displayedStudents.length === 0 ? t("Aucun élève enregistré.") : t("Aucun élève ne correspond à ces filtres.")}</p> : visibleStudents.map(student => (
              <article key={student.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-900">{student.fullName}</h3><p className="mt-1 font-mono text-xs text-primary">{student.codeId}</p>{student.phone && <p className="mt-1 text-xs text-slate-500">{student.phone}</p>}</div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${student.isActive ? "bg-green-50 text-green-800" : "bg-slate-100 text-slate-600"}`}>{student.isActive ? "Actif" : t("Inactif")}</span>
                </div>
                <div className="mt-3 space-y-2">{student.groups.length ? student.groups.map(group => <EnrollmentPriceEditor key={group.enrollmentId} enrollmentId={group.enrollmentId} groupName={group.name} monthlyPrice={group.monthlyPrice} disabled={offline.isOffline || offline.isUsingCachedData} />) : <span className="text-xs text-amber-800">{t("Aucune matière")}</span>}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {editingStudentId === student.id ? (
                    <>
                      <button type="button" onClick={() => setEditingStudentId(null)} className="inline-flex min-h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600">{t("Annuler")}</button>
                      <button type="button" disabled={profilePending} onClick={() => saveStudentProfile(student.id)} className="inline-flex min-h-9 items-center rounded-xl bg-primary px-3 text-[11px] font-semibold text-white disabled:opacity-60">{profilePending ? t("Enregistrement…") : t("Enregistrer")}</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => beginStudentEdit(student)} className="inline-flex min-h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700">{t("Modifier")}</button>
                  )}
                  {student.isActive ? <button type="button" onClick={() => void showAccessCard(student)} disabled={offline.isOffline || offline.isUsingCachedData || cardPendingFor === student.id} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-primary/20 px-3 text-[11px] font-semibold text-primary transition hover:bg-primary-soft disabled:opacity-60"><KeyRound size={15} />{cardPendingFor === student.id ? t("Génération…") : t("Carte d’accès")}</button> : <p className="text-xs text-slate-500">{t("Réactivez ce compte avant de créer une carte d’accès.")}</p>}
                </div>
                {editingStudentId === student.id && (
                  <div className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <label htmlFor={`edit-name-${student.id}`} className="mb-1 block text-[11px] font-medium text-slate-600">{t("Nom complet")}</label>
                      <input id={`edit-name-${student.id}`} value={profileValues.fullName} onChange={event => setProfileValues(current => ({ ...current, fullName: event.target.value }))} className="field-control" />
                    </div>
                    <div>
                      <label htmlFor={`edit-phone-${student.id}`} className="mb-1 block text-[11px] font-medium text-slate-600">{t("Téléphone")}</label>
                      <input id={`edit-phone-${student.id}`} value={profileValues.phone} onChange={event => setProfileValues(current => ({ ...current, phone: event.target.value }))} className="field-control" placeholder="+212 6 12 34 56 78" />
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input type="checkbox" checked={profileValues.active} onChange={event => setProfileValues(current => ({ ...current, active: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-primary" /> {t("Compte actif")} </label>
                    {profileError && <p role="alert" className="text-xs text-red-700">{t(profileError)}</p>}
                  </div>
                )}
              </article>
            ))}
          </div>
          {studentPageCount > 1 && <nav aria-label={t("Pagination des élèves")} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500">{t("Élèves")} {(studentPage - 1) * STUDENT_PAGE_SIZE + 1}–{Math.min(studentPage * STUDENT_PAGE_SIZE, filteredStudents.length)} {t("sur")} {filteredStudents.length}</p>
            <div className="flex items-center gap-2">
              <button type="button" disabled={studentPage === 1} onClick={() => setStudentPage(current => current - 1)} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 disabled:opacity-40">{t("Précédent")}</button>
              <span aria-live="polite" className="text-xs font-medium text-slate-600">{t("Page")} {studentPage} / {studentPageCount}</span>
              <button type="button" disabled={studentPage === studentPageCount} onClick={() => setStudentPage(current => current + 1)} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 disabled:opacity-40">{t("Suivant")}</button>
            </div>
          </nav>}
        </section>
      </section>

      {state.success && state.credentials && newCardAvailable && <NewStudentCardNotice
        fullName={state.credentials.fullName}
        codeId={state.credentials.codeId}
        onWhatsApp={shareNewStudentCredentials}
        onShowCard={() => {
          if (!newCredential) return;
          setCredentials({
            fullName: newCredential.fullName,
            codeId: newCredential.codeId,
            pin: newCredential.pin,
            qrToken: newCredential.qrToken,
            groups: newCredential.groups,
            phone: newCredential.phone,
          });
        }}
      />}
      {credentials && <AccessCardModal credentials={credentials} onClose={closeCard} />}
    </>
  );
}

function NewStudentCardNotice({ fullName, codeId, onWhatsApp, onShowCard }: {
  fullName: string;
  codeId: string;
  onWhatsApp: () => void;
  onShowCard: () => void;
}) {
  const { t } = useTranslation();
  return <div role="status" className="mb-6 flex flex-col gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 sm:flex-row sm:items-start">
    <CheckCircle2 size={19} className="mt-0.5 shrink-0" />
    <div className="min-w-0 flex-1">
      <p>{t("Compte de")} <strong>{fullName}</strong> {t("créé (")}<span className="font-mono">{codeId}</span>{t("). Le PIN est conservé temporairement dans cette page et n’est jamais enregistré en clair.")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onWhatsApp} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-green-700 px-3 text-xs font-semibold text-white hover:bg-green-800">
          <MessageCircle size={15} />{t("Envoyer les identifiants par WhatsApp")}
        </button>
        <button type="button" onClick={onShowCard} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-primary/20 bg-white px-3 text-xs font-semibold text-primary hover:bg-primary-soft">
          <KeyRound size={15} />{t("Afficher la carte d’accès créée")}
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-amber-900">{t("WhatsApp s’ouvrira avec le message prérempli. Vérifiez le destinataire puis appuyez sur Envoyer; ne partagez pas le PIN dans un groupe.")}</p>
    </div>
  </div>;
}

function FormField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return <div><label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-700">{t(label)}</label>{children}</div>;
}

function FormFeedback({ state }: { state: StudentActionState }) {
  const { t } = useTranslation();
  if (state.error) return <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-800"><AlertCircle size={17} className="mt-0.5 shrink-0" />{t(state.error)}</p>;
  if (state.success && !state.credentials) return <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-green-100 bg-green-50 p-3 text-sm text-green-800"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{t(state.success)}</p>;
  return null;
}

function EnrollmentPriceEditor({ enrollmentId, groupName, monthlyPrice, disabled }: {
  enrollmentId: string;
  groupName: string;
  monthlyPrice: string;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(monthlyPrice);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await updateEnrollmentPrice(enrollmentId, value);
        if (!result.ok) {
          setMessage(result.message);
          return;
        }
        setEditing(false);
        router.refresh();
      } catch {
        setMessage(t("Le tarif n’a pas pu être enregistré. Vérifiez la connexion et réessayez."));
      }
    });
  }

  if (!editing) {
    return <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
      <span className="text-xs text-slate-700">{groupName} · {formatMad(Number(monthlyPrice))} {t("MAD / mois")}</span>
      <button type="button" aria-label={`Modifier le tarif de ${groupName}`} disabled={disabled} onClick={() => { setValue(monthlyPrice); setEditing(true); }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-primary hover:bg-primary-soft disabled:opacity-50"><Pencil size={14} /></button>
    </div>;
  }

  return <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
    <label htmlFor={`edit-price-${enrollmentId}`} className="block text-xs font-medium text-slate-700">{t("Nouveau tarif mensuel ·")} {groupName} (MAD)</label>
    <div className="mt-2 flex gap-2">
      <input id={`edit-price-${enrollmentId}`} type="number" min="0" max="99999999.99" step="0.01" value={value} onChange={event => setValue(event.target.value)} className="field-control min-w-0" />
      <button type="button" aria-label={`Enregistrer le tarif de ${groupName}`} disabled={pending} onClick={save} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white disabled:opacity-50">{pending ? "…" : <Check size={17} />}</button>
      <button type="button" aria-label={`Annuler la modification du tarif de ${groupName}`} disabled={pending} onClick={() => { setEditing(false); setMessage(""); }} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"><X size={17} /></button>
    </div>
    {message && <p role="alert" className="mt-2 text-xs text-red-700">{t(message)}</p>}
  </div>;
}

function formatMad(value: number): string {
  return new Intl.NumberFormat("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
}
