"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Users } from "lucide-react";
import { formattaData } from "@/components/foglio-google";

type Esito = { type: "success" | "warning" | "error"; message: string };
type Stato = { collegato: boolean; indirizzo: string | null; copia: { presente: boolean; aggiornataIl: string | null } };

const stileEsito: Record<Esito["type"], string> = {
  success: "bg-emerald-500/10 text-emerald-800 border border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-900 border border-amber-500/25",
  error: "bg-red-500/10 text-red-800 border border-red-500/20",
};

/**
 * Un solo pulsante: «Registro autisti». Se il secondo Foglio non è ancora collegato chiede l'indirizzo
 * dell'antenna (app web Apps Script, codice in strumenti/foglio-google-autisti.gs), lo prova e lo salva;
 * poi sincronizza diario conducenti, manutenzioni e stato dei mezzi dalla scheda USCITA_AUTISTI.
 */
export default function SyncAutistiButton({ variant = "sidebar", className = "" }: { variant?: "sidebar" | "banner"; className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Esito | null>(null);
  const [stato, setStato] = useState<Stato | null>(null);
  const [versione, setVersione] = useState(0);
  const leggiStato = () => setVersione((v) => v + 1);

  useEffect(() => {
    let attivo = true;
    fetch("/api/foglio-autisti", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Stato>) : null))
      .then((d) => {
        if (attivo && d) setStato(d); // se non disponibile il pulsante funziona comunque
      })
      .catch(() => null);
    return () => {
      attivo = false;
    };
  }, [versione]);

  async function collega(): Promise<boolean> {
    const indirizzo = prompt(
      "Registro autisti non ancora collegato.\n\nIncolla l'indirizzo dell'app web della sua antenna Apps Script (finisce con /exec).\nIl codice dell'antenna è in strumenti/foglio-google-autisti.gs; va installato come quello del Foglio del gasolio.",
    );
    if (!indirizzo || !indirizzo.trim()) return false;
    const res = await fetch("/api/foglio-autisti", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ indirizzo: indirizzo.trim() }),
    });
    const data = (await res.json()) as { ok: boolean; messaggio?: string; errore?: string };
    if (!data.ok) throw new Error(data.errore || "Collegamento non riuscito.");
    return true;
  }

  async function handleSync() {
    setLoading(true);
    setStatus(null);
    try {
      if (stato && !stato.collegato && !stato.copia.presente) {
        const ok = await collega();
        if (!ok) return;
      }
      const res = await fetch("/api/sync-autisti", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Errore durante la sincronizzazione del registro autisti.");
      setStatus({ type: data.avviso ? "warning" : "success", message: `${data.message}${data.avviso ? ` ${data.avviso}` : ""}` });
      router.refresh();
    } catch (err: unknown) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
      leggiStato();
    }
  }

  const sotto =
    stato &&
    (stato.collegato
      ? `collegato${stato.copia.aggiornataIl ? ` · ultimi dati del ${formattaData(stato.copia.aggiornataIl)}` : ""}`
      : stato.copia.presente
        ? `non collegato · copia del ${formattaData(stato.copia.aggiornataIl)}`
        : "non collegato: al primo clic chiede l'indirizzo");

  if (variant === "banner") {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        <button
          onClick={handleSync}
          disabled={loading}
          title="Diario conducenti, manutenzioni e stato dei furgoni dal Foglio «registro autisti»"
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-white/60 px-3 py-2.5 text-xs font-semibold text-ink-900 transition hover:border-ink-950/20 active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          <Users className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
          {loading ? "Registro autisti…" : "Registro autisti"}
        </button>
        {sotto && <span className="px-1 text-[11px] text-mute">{sotto}</span>}
        {status && (
          <div className={`flex items-center gap-2 rounded-xl p-3 text-xs ${stileEsito[status.type]}`}>
            {status.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className={`h-4 w-4 shrink-0 ${status.type === "warning" ? "text-amber-600" : "text-red-600"}`} />}
            <span>{status.message}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <button
        onClick={handleSync}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 active:scale-95 disabled:opacity-50 cursor-pointer"
      >
        <Users className={`h-3.5 w-3.5 ${loading ? "animate-pulse" : ""}`} />
        <span>{loading ? "Registro autisti…" : "Registro autisti"}</span>
      </button>
      {sotto && <p className="px-1 text-[11px] leading-tight text-white/55">{sotto}</p>}
      {status && (
        <p className={`text-[11px] px-1 leading-tight ${status.type === "success" ? "text-emerald-400" : status.type === "warning" ? "text-amber-300" : "text-red-400"}`}>{status.message}</p>
      )}
    </div>
  );
}
