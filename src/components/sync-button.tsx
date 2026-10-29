"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";

export default function SyncButton({
  variant = "sidebar",
  className = "",
}: {
  variant?: "sidebar" | "banner" | "header";
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function handleSync() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Errore durante la sincronizzazione.");
      }

      setStatus({
        type: "success",
        message: `Sincronizzati ${data.vehiclesCount} furgoni e ${data.refuelsCount} rifornimenti!`,
      });

      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({
        type: "error",
        message: msg,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    if (!confirm("Sei sicuro di voler svuotare tutti i dati del database per fare un nuovo test?")) {
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/sync", {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Errore durante l'eliminazione.");
      }
      setStatus({
        type: "success",
        message: "Database svuotato con successo. Ora puoi testare il tasto di sincronizzazione!",
      });
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ type: "error", message: msg });
    } finally {
      setLoading(false);
    }
  }

  if (variant === "banner") {
    return (
      <div className={`rounded-2xl border border-volt-500/20 bg-volt-500/5 p-6 backdrop-blur ${className}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-volt-500 animate-pulse" />
              <h3 className="font-display text-base font-bold text-ink-900">
                Sincronizzazione Dati Google Fogli
              </h3>
            </div>
            <p className="mt-1 text-xs text-mute max-w-xl leading-relaxed">
              Recupera automaticamente tutti i furgoni, i km attuali, le scadenze dei contratti e lo storico completo dei rifornimenti direttamente dal foglio aggiornato ogni giorno.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-volt-500 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-950 shadow-md transition hover:bg-volt-400 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Sincronizzazione..." : "Sincronizza Ora"}
            </button>
            <button
              onClick={handleClear}
              disabled={loading}
              title="Svuota database per ripetere il test"
              className="inline-flex items-center justify-center rounded-xl border border-line bg-white/50 p-2.5 text-xs text-mute hover:text-red-600 hover:border-red-200 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {status && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-xs ${
              status.type === "success"
                ? "bg-emerald-500/10 text-emerald-800 border border-emerald-500/20"
                : "bg-red-500/10 text-red-800 border border-red-500/20"
            }`}
          >
            {status.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            )}
            <span>{status.message}</span>
          </div>
        )}
      </div>
    );
  }

  // Sidebar variant
  return (
    <div className={`space-y-2 ${className}`}>
      <button
        onClick={handleSync}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-volt-500/15 border border-volt-500/30 px-3 py-2.5 text-xs font-semibold text-volt-400 transition hover:bg-volt-500/25 active:scale-95 disabled:opacity-50 cursor-pointer"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        <span>{loading ? "Aggiornamento..." : "Sincronizza Fogli"}</span>
      </button>

      {status && (
        <p
          className={`text-[11px] px-1 leading-tight ${
            status.type === "success" ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
