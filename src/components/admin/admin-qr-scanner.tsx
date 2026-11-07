"use client";
import { useTranslation } from "@/components/i18n/language-provider";

import { useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { AlertCircle, Camera, CheckCircle2, LoaderCircle, QrCode, RotateCcw, XCircle } from "lucide-react";

type ScanResult = {
  codeId: string;
  fullName: string;
  status: "PAID" | "PARTIAL" | "UNPAID" | "INACTIVE";
  year?: number;
  month?: number;
  remainingCents?: number;
};

const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export default function AdminQrScanner() {
  const { t } = useTranslation();
  const reader = useRef<Html5Qrcode | null>(null);
  const scanLock = useRef(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => () => {
    const scanner = reader.current;
    if (scanner?.isScanning) void scanner.stop().catch(error => console.error("Could not stop QR scanner on unmount", error));
  }, []);

  async function stopCamera() {
    const scanner = reader.current;
    if (scanner?.isScanning) {
      try {
        await scanner.stop();
      } catch (error) {
        console.error("Could not stop QR scanner", error);
        setMessage("Impossible d’arrêter proprement la caméra. Fermez l’onglet si elle reste active.");
      }
    }
    setCameraActive(false);
  }

  async function handleCode(decodedText: string) {
    if (scanLock.current) return;
    scanLock.current = true;
    setMessage("");
    await stopCamera();
    try {
      const response = await fetch("/api/admin/scan", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codeId: decodedText }),
        signal: AbortSignal.timeout(15000),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const errorMessage = typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string"
          ? payload.message
          : "Le QR code n’a pas pu être vérifié.";
        setMessage(errorMessage);
        return;
      }
      if (!isScanResult(payload)) {
        setMessage("Réponse serveur invalide.");
        return;
      }
      setResult(payload);
      if (payload.status === "PAID") playConfirmationSound();
    } catch {
      setMessage(t("Vérification impossible. Vérifiez la connexion au réseau du centre."));
    } finally {
      scanLock.current = false;
    }
  }

  async function startCamera() {
    setMessage("");
    setResult(null);
    setStarting(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = reader.current ?? new Html5Qrcode("nour-qr-reader", { verbose: false });
      reader.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
        decodedText => { void handleCode(decodedText); },
        () => undefined,
      );
      setCameraActive(true);
    } catch (error) {
      console.error("Could not start QR scanner camera", error);
      setMessage(t("Caméra inaccessible. Autorisez son utilisation et vérifiez que le site est en HTTPS."));
    } finally {
      setStarting(false);
    }
  }

  const paid = result?.status === "PAID";
  const inactive = result?.status === "INACTIVE";
  const monthLabel = result?.month && result.year ? `${months[result.month - 1]} ${result.year}` : "";

  return (
    <div>
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
        <div className="relative flex min-h-[300px] items-center justify-center bg-slate-950 p-4">
          <div id="nour-qr-reader" className="w-full max-w-md overflow-hidden rounded-2xl" />
          {!cameraActive && <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10"><QrCode size={34} /></span><p className="mt-4 text-sm text-slate-300">{t("La caméra apparaîtra ici.")}</p></div>}
        </div>
        <div className="flex flex-wrap gap-3 p-4 sm:p-5">
          {!cameraActive ? <button type="button" disabled={starting} onClick={() => void startCamera()} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">{starting ? <><LoaderCircle size={18} className="animate-spin" />{t("Ouverture…")}</> : <><Camera size={18} />{t("Ouvrir la caméra")}</>}</button> : <button type="button" onClick={() => void stopCamera()} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Camera size={18} />{t("Arrêter la caméra")}</button>}
          {result && <button type="button" onClick={() => { setResult(null); void startCamera(); }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RotateCcw size={17} />{t("Scanner suivant")}</button>}
        </div>
        <p className="px-5 pb-5 text-xs leading-5 text-slate-500">{t("La lecture du QR ne contient que le Code ID. La situation mensuelle est récupérée depuis la base du centre et n’est pas divulguée publiquement.")}</p>
      </section>

      {message && <div role="alert" className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><AlertCircle size={19} className="mt-0.5 shrink-0" />{t(message)}</div>}

      {result && <section aria-live="polite" className={`mt-5 rounded-3xl border p-6 text-center shadow-card sm:p-8 ${paid ? "border-green-200 bg-green-50" : inactive ? "border-slate-300 bg-slate-100" : "border-red-200 bg-red-50"}`}>
        <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${paid ? "bg-green-600 text-white" : inactive ? "bg-slate-500 text-white" : "bg-red-600 text-white"}`}>{paid ? <CheckCircle2 size={36} /> : <XCircle size={36} />}</span>
        <p className={`mt-4 text-xs font-bold uppercase tracking-[0.16em] ${paid ? "text-green-800" : inactive ? "text-slate-700" : "text-red-800"}`}>{paid ? t("Paiement confirmé") : inactive ? t("Compte désactivé") : result.status === "PARTIAL" ? t("Paiement incomplet") : t("Reste à payer")}</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{result.fullName}</h2>
        <p className="mt-2 font-mono text-lg font-semibold text-slate-700">{result.codeId}</p>
        {!inactive && <p className={`mt-4 text-lg font-semibold ${paid ? "text-green-800" : "text-red-800"}`}>{paid ? `À jour pour ${monthLabel}` : `${formatMoney(result.remainingCents ?? 0)} MAD restants · ${monthLabel}`}</p>}
        {inactive && <p className="mt-3 text-sm text-slate-700">{t("Contactez l’administration du centre NOUR.")}</p>}
      </section>}
    </div>
  );
}

function playConfirmationSound() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    void context.close();
  } catch (error) {
    console.error("Could not play payment confirmation sound", error);
  }
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function isScanResult(value: unknown): value is ScanResult {
  if (typeof value !== "object" || value === null || !("codeId" in value) || !("fullName" in value) || !("status" in value)) return false;
  if (typeof value.codeId !== "string" || typeof value.fullName !== "string") return false;
  if (value.status !== "PAID" && value.status !== "PARTIAL" && value.status !== "UNPAID" && value.status !== "INACTIVE") return false;
  if ("year" in value && (!Number.isSafeInteger(value.year) || Number(value.year) < 1)) return false;
  if ("month" in value && (!Number.isSafeInteger(value.month) || Number(value.month) < 1 || Number(value.month) > 12)) return false;
  if ("remainingCents" in value && (!Number.isSafeInteger(value.remainingCents) || Number(value.remainingCents) < 0)) return false;
  return true;
}
