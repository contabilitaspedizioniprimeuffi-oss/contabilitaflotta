"use client";

// ---------------------------------------------------------------------------
// Pulsante "Sincronizza con GitHub"
// Mostra la versione installata e le novita' pubblicate su GitHub; con
// "Scarica e installa" il programma si chiude, si aggiorna (con copia di
// sicurezza dei dati) e si riapre da solo.
// ---------------------------------------------------------------------------
import {
  AlertTriangle,
  CheckCircle2,
  CloudDownload,
  GitBranch,
  Loader2,
  RotateCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { StatoSincronizzazione } from "@/lib/aggiornamento";

const FLAG_DOPO_AGGIORNAMENTO = "bda-dopo-aggiornamento";

type Fase = "pronto" | "avvio" | "chiusura" | "riavvio" | "errore";

const ESITI: Record<string, { testo: string; ok: boolean }> = {
  aggiornato: { testo: "riuscita, programma aggiornato", ok: true },
  "gia-aggiornato": { testo: "nessuna novità da installare", ok: true },
  offline: { testo: "non riuscita: GitHub non raggiungibile", ok: false },
  "non-riuscito": { testo: "non riuscita, è rimasta la versione precedente", ok: false },
  scartata: { testo: "saltata: l'ultima versione non si era installata correttamente", ok: false },
  "programma-aperto": { testo: "non eseguita: il programma era aperto", ok: false },
  errore: { testo: "non riuscita", ok: false },
};

function fmtData(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

async function serverAttivo(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const r = await fetch("/api/health", { cache: "no-store", signal: ctrl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function GithubSync() {
  const [info, setInfo] = useState<StatoSincronizzazione | null>(null);
  const [controllo, setControllo] = useState(false);
  const [aperto, setAperto] = useState(false);
  const [fase, setFase] = useState<Fase>("pronto");
  const [errore, setErrore] = useState<string | null>(null);
  const [appenaAggiornato, setAppenaAggiornato] = useState(false);
  const [montato, setMontato] = useState(false);
  const attivo = useRef(true);

  const occupato = fase === "avvio" || fase === "chiusura" || fase === "riavvio";

  const controlla = useCallback(async (forza: boolean) => {
    setControllo(true);
    try {
      const r = await fetch(`/api/aggiornamento${forza ? "?forza=1" : ""}`, { cache: "no-store" });
      const dati = (await r.json()) as StatoSincronizzazione;
      if (attivo.current) setInfo(dati);
    } catch {
      if (attivo.current) {
        setInfo((prec) =>
          prec ? { ...prec, stato: "errore", errore: "Controllo non riuscito, riprova." } : null,
        );
      }
    } finally {
      if (attivo.current) setControllo(false);
    }
  }, []);

  // Primo controllo all'apertura del programma (e dopo un aggiornamento)
  useEffect(() => {
    attivo.current = true;
    setMontato(true);
    let dopo = false;
    try {
      dopo = sessionStorage.getItem(FLAG_DOPO_AGGIORNAMENTO) === "1";
      sessionStorage.removeItem(FLAG_DOPO_AGGIORNAMENTO);
    } catch {}
    if (dopo) {
      setAppenaAggiornato(true);
      setAperto(true);
    }
    void controlla(dopo);
    return () => {
      attivo.current = false;
    };
  }, [controlla]);

  // Esc per chiudere, scroll della pagina bloccato
  useEffect(() => {
    if (!aperto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !occupato) {
        setAperto(false);
        setAppenaAggiornato(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [aperto, occupato]);

  function apri() {
    setAperto(true);
    if (!occupato) {
      setErrore(null);
      setFase("pronto");
      void controlla(true);
    }
  }

  function chiudi() {
    if (occupato) return;
    setAperto(false);
    setAppenaAggiornato(false);
  }

  async function installa(forza: boolean) {
    setErrore(null);
    setAppenaAggiornato(false);
    setFase("avvio");
    try {
      const r = await fetch("/api/aggiornamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forza }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.messaggio || "Impossibile avviare l'aggiornamento.");
    } catch (e) {
      setFase("errore");
      setErrore(e instanceof Error ? e.message : String(e));
      return;
    }

    // 1) il programma si chiude per aggiornarsi
    setFase("chiusura");
    let chiuso = false;
    for (const fine = Date.now() + 45_000; Date.now() < fine && attivo.current; ) {
      if (!(await serverAttivo())) {
        chiuso = true;
        break;
      }
      await pausa(1000);
    }
    if (!chiuso) {
      setFase("errore");
      setErrore(
        "Il programma non ha avviato l'aggiornamento. Chiudi la finestra, riapri Banca Dati Automezzi e riprova.",
      );
      return;
    }

    // 2) aggiornamento in corso: si aspetta che il programma torni disponibile
    setFase("riavvio");
    for (const fine = Date.now() + 60 * 60_000; Date.now() < fine && attivo.current; ) {
      await pausa(2000);
      if (await serverAttivo()) {
        try {
          sessionStorage.setItem(FLAG_DOPO_AGGIORNAMENTO, "1");
        } catch {}
        window.location.reload();
        return;
      }
    }
    setFase("errore");
    setErrore("Il programma non si è riavviato. Chiudi la finestra e riapri Banca Dati Automezzi.");
  }

  // ---------------------------------------------------------------------------
  // Pulsante nella barra laterale
  // ---------------------------------------------------------------------------
  const daInstallare = info?.stato === "novita" || info?.stato === "prima-volta";
  let sottotitolo = controllo ? "Controllo in corso…" : "Stato non disponibile";
  if (occupato) sottotitolo = "Aggiornamento in corso…";
  else if (info) {
    if (info.stato === "aggiornato") sottotitolo = "Programma aggiornato";
    else if (info.stato === "novita")
      sottotitolo =
        info.totaleNovita === 1 ? "1 novità da installare" : `${info.totaleNovita} novità da installare`;
    else if (info.stato === "prima-volta") sottotitolo = "Da collegare a GitHub";
    else if (info.stato === "offline") sottotitolo = "GitHub non raggiungibile";
    else sottotitolo = "Controllo non riuscito";
  }

  const esito = info?.ultimoEsito ? ESITI[info.ultimoEsito.esito] ?? ESITI.errore : null;

  return (
    <>
      <button
        onClick={apri}
        className="group flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.07] active:scale-[0.98]"
      >
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/70 transition-colors group-hover:text-white">
          {occupato ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <GitBranch className="h-3.5 w-3.5" strokeWidth={2.4} />
          )}
          {daInstallare && !occupato && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-volt-500 ring-2 ring-ink-950" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-white/85">Sincronizza con GitHub</span>
          <span
            className={`block truncate text-[10px] ${daInstallare ? "text-volt-400" : "text-white/35"}`}
          >
            {sottotitolo}
          </span>
        </span>
      </button>

      {montato &&
        aperto &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center sm:p-6">
            <div
              className="absolute inset-0 bg-ink-950/45 backdrop-blur-sm"
              onClick={chiudi}
              aria-hidden
            />
            <div className="relative w-full max-w-lg animate-rise overflow-hidden rounded-[24px] border border-line bg-card shadow-2xl">
              <header className="flex items-center gap-3 border-b border-line px-6 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink-950 text-volt-500">
                  <GitBranch className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-base font-extrabold uppercase tracking-tight">
                    Sincronizza con GitHub
                  </h3>
                  <p className="text-[11px] text-mute">Aggiornamenti del programma · i dati restano sul PC</p>
                </div>
                {!occupato && (
                  <button
                    onClick={chiudi}
                    className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-mute transition-colors hover:bg-ink-950/5 hover:text-ink-950"
                    aria-label="Chiudi"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </header>

              <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
                {/* Esito dell'aggiornamento appena terminato */}
                {appenaAggiornato && info?.ultimoEsito && esito && (
                  <div
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${
                      esito.ok
                        ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-900"
                        : "border-amber/30 bg-amber/10 text-ink-900"
                    }`}
                  >
                    {esito.ok ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
                    )}
                    <div className="text-sm">
                      <p className="font-bold">
                        {info.ultimoEsito.esito === "aggiornato"
                          ? "Aggiornamento completato"
                          : esito.ok
                            ? "Nessuna novità installata"
                            : "Aggiornamento non riuscito"}
                      </p>
                      <p className="mt-0.5 text-xs opacity-80">
                        {esito.ok
                          ? "Le modifiche pubblicate su GitHub sono ora nel programma."
                          : "I dati non sono stati toccati. Dettagli nel file logs\\aggiornamento.log."}
                      </p>
                    </div>
                  </div>
                )}

                {/* Versione installata */}
                <div className="rounded-2xl border border-line bg-paper/60 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-mute">
                    Versione installata
                  </p>
                  {info?.installata ? (
                    <div className="mt-1 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-snug text-ink-900">
                          {info.installata.messaggio}
                        </p>
                        <p className="mt-0.5 text-xs text-mute">del {fmtData(info.installata.data)}</p>
                      </div>
                      <span className="shrink-0 rounded-md bg-ink-950/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-ink-700">
                        {info.installata.breve}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-mute">
                      {controllo && !info ? "Lettura in corso…" : "Non ancora collegata a GitHub"}
                    </p>
                  )}
                </div>

                {/* Aggiornamento in corso */}
                {occupato && (
                  <div className="rounded-2xl border border-volt-500/30 bg-volt-500/10 px-4 py-4">
                    <div className="flex items-center gap-2.5">
                      <Loader2 className="h-5 w-5 animate-spin text-volt-700" />
                      <p className="text-sm font-bold text-ink-900">Aggiornamento in corso</p>
                    </div>
                    <ol className="mt-3 space-y-1.5 text-sm">
                      <Passo fatto={fase === "riavvio"} attivo={fase !== "riavvio"}>
                        Chiusura del programma
                      </Passo>
                      <Passo fatto={false} attivo={fase === "riavvio"}>
                        Copia di sicurezza dei dati, download e preparazione
                      </Passo>
                      <Passo fatto={false} attivo={false}>
                        Riapertura automatica
                      </Passo>
                    </ol>
                    <p className="mt-3 text-xs leading-relaxed text-mute">
                      Può richiedere qualche minuto. Non chiudere questa finestra: il programma si riaprirà
                      da solo.
                    </p>
                  </div>
                )}

                {/* Errore nell'avvio dell'aggiornamento */}
                {fase === "errore" && errore && (
                  <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm font-semibold text-danger">
                    {errore}
                  </p>
                )}

                {/* Stato del controllo */}
                {!occupato && (
                  <>
                    {controllo && (
                      <div className="flex items-center gap-2.5 text-sm text-mute">
                        <Loader2 className="h-4 w-4 animate-spin" /> Controllo GitHub in corso…
                      </div>
                    )}

                    {!controllo && info?.stato === "aggiornato" && (
                      <div className="flex items-center gap-2.5 text-sm font-semibold text-emerald-700">
                        <CheckCircle2 className="h-5 w-5" /> Il programma è aggiornato: non ci sono novità.
                      </div>
                    )}

                    {!controllo && (info?.stato === "offline" || info?.stato === "errore") && (
                      <div className="flex items-start gap-2.5 rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-ink-900">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
                        <span>{info.errore || "Controllo non riuscito."}</span>
                      </div>
                    )}

                    {!controllo && info?.stato === "novita" && (
                      <div>
                        <p className="text-sm font-bold text-ink-900">
                          {info.totaleNovita === 1
                            ? "1 novità da installare"
                            : `${info.totaleNovita} novità da installare`}
                        </p>
                        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line">
                          {info.novita.map((v) => (
                            <li key={v.sha} className="flex items-start justify-between gap-3 px-4 py-2.5">
                              <span className="text-sm leading-snug text-ink-900">{v.messaggio}</span>
                              <span className="shrink-0 pt-0.5 text-[11px] text-mute">{fmtData(v.data)}</span>
                            </li>
                          ))}
                        </ul>
                        {info.totaleNovita > info.novita.length && (
                          <p className="mt-1.5 text-xs text-mute">
                            …e altre {info.totaleNovita - info.novita.length}.
                          </p>
                        )}
                      </div>
                    )}

                    {!controllo && info?.stato === "prima-volta" && (
                      <div className="rounded-2xl border border-sky/25 bg-sky/10 px-4 py-3 text-sm text-ink-900">
                        <p className="font-bold">Prima sincronizzazione</p>
                        <p className="mt-1 text-xs leading-relaxed text-ink-700">
                          La cartella del programma verrà allineata alla versione pubblicata su GitHub
                          {info.github ? ` (${info.github.messaggio}, del ${fmtData(info.github.data)})` : ""}.
                          Prima viene salvata una copia completa della cartella.
                        </p>
                      </div>
                    )}

                    {!controllo && daInstallare && info?.versioneScartata && (
                      <div className="flex items-start gap-2.5 rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-ink-900">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
                        <span>
                          L&apos;ultima volta questa versione non si era installata correttamente ed è stata messa
                          da parte. Puoi riprovare.
                        </span>
                      </div>
                    )}

                    {!controllo && daInstallare && info && !info.puoInstallare && (
                      <div className="flex items-start gap-2.5 rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-ink-900">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
                        <span>
                          Il programma non è stato aperto da «Banca Dati Automezzi.exe», quindi non può
                          aggiornarsi da solo: chiudilo e fai doppio clic su «aggiorna-da-github.bat».
                        </span>
                      </div>
                    )}

                    {daInstallare && (
                      <p className="flex items-start gap-2 text-xs leading-relaxed text-mute">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-volt-700" />
                        Prima di installare viene salvata una copia del database nella cartella «backup». I
                        dati non vengono toccati e, se qualcosa va storto, torna da solo la versione
                        precedente.
                      </p>
                    )}
                  </>
                )}
              </div>

              {!occupato && (
                <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">
                  {info?.ultimoEsito && esito && (
                    <p className="mr-auto text-[11px] leading-tight text-mute">
                      Ultima sincronizzazione: {fmtData(info.ultimoEsito.quando)}
                      <br />
                      <span className={esito.ok ? "text-emerald-700" : "text-amber"}>{esito.testo}</span>
                    </p>
                  )}
                  <button type="button" onClick={chiudi} className="btn-ghost">
                    Chiudi
                  </button>
                  {daInstallare && info?.puoInstallare ? (
                    <button
                      type="button"
                      onClick={() => installa(Boolean(info.versioneScartata))}
                      className="btn-primary"
                      disabled={controllo}
                    >
                      <CloudDownload className="h-4 w-4" strokeWidth={2.4} />
                      {info.versioneScartata
                        ? "Riprova l'installazione"
                        : info.stato === "prima-volta"
                          ? "Sincronizza ora"
                          : "Scarica e installa"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => controlla(true)}
                      className="btn-dark"
                      disabled={controllo}
                    >
                      <RotateCw className={`h-4 w-4 ${controllo ? "animate-spin" : ""}`} />
                      Controlla di nuovo
                    </button>
                  )}
                </footer>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Passo({
  fatto,
  attivo,
  children,
}: {
  fatto: boolean;
  attivo: boolean;
  children: ReactNode;
}) {
  return (
    <li className={`flex items-center gap-2 ${fatto || attivo ? "text-ink-900" : "text-mute"}`}>
      {fatto ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      ) : attivo ? (
        <Loader2 className="h-4 w-4 animate-spin text-volt-700" />
      ) : (
        <span className="ml-1 mr-1 h-2 w-2 rounded-full bg-ink-950/20" />
      )}
      <span className={attivo ? "font-semibold" : ""}>{children}</span>
    </li>
  );
}
