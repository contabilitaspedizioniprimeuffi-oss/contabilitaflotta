"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  LoaderCircle,
  Unlink,
  X,
} from "lucide-react";

export type StatoFoglio = {
  collegato: boolean;
  indirizzo: string | null;
  copia: { presente: boolean; aggiornataIl: string | null };
  linkFoglio: string | null;
  codice?: string | null;
  codiceSenzaId?: boolean;
};

export function formattaData(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Stato del collegamento al Foglio Google, letto dal programma */
function leggiStato(conCodice: boolean): Promise<StatoFoglio | null> {
  return fetch(`/api/foglio-google${conCodice ? "?codice=1" : ""}`, { cache: "no-store" })
    .then((res) => (res.ok ? (res.json() as Promise<StatoFoglio>) : null))
    .catch(() => null);
}

export function useStatoFoglio() {
  const [stato, setStato] = useState<StatoFoglio | null>(null);
  const [versione, setVersione] = useState(0);
  useEffect(() => {
    let attivo = true;
    void leggiStato(false).then((d) => {
      if (attivo && d) setStato(d); // se non disponibile il pulsante funziona comunque
    });
    return () => {
      attivo = false;
    };
  }, [versione]);
  const ricarica = useCallback(() => setVersione((v) => v + 1), []);
  return { stato, ricarica };
}

function Passo({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-950 text-[11px] font-bold text-volt-500">
        {n}
      </span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-900">{children}</div>
    </li>
  );
}

const B = ({ children }: { children: ReactNode }) => <strong className="font-semibold">{children}</strong>;

export function FoglioGoogleDialog({
  onClose,
  onCambiato,
}: {
  onClose: () => void;
  onCambiato?: () => void;
}) {
  const [stato, setStato] = useState<StatoFoglio | null>(null);
  const [indirizzo, setIndirizzo] = useState("");
  const [cambia, setCambia] = useState(false);
  const [lavoro, setLavoro] = useState(false);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);
  const [copiato, setCopiato] = useState(false);
  const [mostraCodice, setMostraCodice] = useState(false);
  const [versione, setVersione] = useState(0);
  const carica = () => setVersione((v) => v + 1);

  useEffect(() => {
    let attivo = true;
    void leggiStato(true).then((d) => {
      if (!attivo) return;
      if (d) setStato(d);
      else setEsito({ ok: false, testo: "Impossibile leggere lo stato del collegamento." });
    });
    return () => {
      attivo = false;
    };
  }, [versione]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !lavoro && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, lavoro]);

  async function copiaCodice() {
    const testo = stato?.codice ?? "";
    if (!testo) return;
    try {
      await navigator.clipboard.writeText(testo);
    } catch {
      const area = document.createElement("textarea");
      area.value = testo;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopiato(true);
    setTimeout(() => setCopiato(false), 2500);
  }

  async function collega() {
    setLavoro(true);
    setEsito(null);
    try {
      const res = await fetch("/api/foglio-google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ indirizzo }),
      });
      const data = (await res.json()) as { ok: boolean; messaggio?: string; errore?: string };
      if (!data.ok) throw new Error(data.errore || "Collegamento non riuscito.");
      setEsito({ ok: true, testo: data.messaggio ?? "Foglio Google collegato." });
      setIndirizzo("");
      setCambia(false);
      carica();
      onCambiato?.();
    } catch (e) {
      setEsito({ ok: false, testo: e instanceof Error ? e.message : String(e) });
    } finally {
      setLavoro(false);
    }
  }

  async function scollega() {
    if (!confirm("Scollegare il Foglio Google? «Sincronizza» userà solo la copia salvata nel PC.")) return;
    setLavoro(true);
    setEsito(null);
    try {
      const res = await fetch("/api/foglio-google", { method: "DELETE" });
      const data = (await res.json()) as { ok: boolean; errore?: string };
      if (!data.ok) throw new Error(data.errore || "Operazione non riuscita.");
      setEsito({ ok: true, testo: "Foglio Google scollegato." });
      carica();
      onCambiato?.();
    } catch (e) {
      setEsito({ ok: false, testo: e instanceof Error ? e.message : String(e) });
    } finally {
      setLavoro(false);
    }
  }

  const collegato = !!stato?.collegato;
  const mostraIstruzioni = stato !== null && (!collegato || cambia);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-ink-950/45 backdrop-blur-sm"
        onClick={() => !lavoro && onClose()}
        aria-hidden
      />
      <div className="relative flex max-h-[92vh] w-full max-w-2xl animate-rise flex-col overflow-hidden rounded-[24px] border border-line bg-card shadow-2xl">
        <header className="flex items-center gap-3 border-b border-line px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink-950 text-volt-500">
            <FileSpreadsheet className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <div>
            <h3 className="font-display text-base font-extrabold uppercase tracking-tight">Foglio Google</h3>
            <p className="text-[11px] text-mute">Da dove «Sincronizza» prende i dati</p>
          </div>
          <button
            onClick={() => !lavoro && onClose()}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-mute transition-colors hover:bg-ink-950/5 hover:text-ink-950"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          {stato === null && (
            <div className="flex items-center gap-2 text-sm text-mute">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Lettura dello stato…
            </div>
          )}

          {stato && (
            <div
              className={`rounded-2xl border p-4 ${
                collegato ? "border-emerald-500/25 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"
              }`}
            >
              <div className="flex items-start gap-3">
                {collegato ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                )}
                <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
                  {collegato ? (
                    <>
                      <p className="font-semibold text-ink-900">Collegato: i dati arrivano dal Foglio online.</p>
                      <p className="mt-0.5 break-all font-mono text-[11px] text-mute">{stato.indirizzo}</p>
                    </>
                  ) : (
                    <p className="font-semibold text-ink-900">
                      Non collegato: «Sincronizza» usa solo la copia salvata nel PC, che non si aggiorna.
                    </p>
                  )}
                  <p className="mt-1 text-[12px] text-mute">
                    {stato.copia.presente
                      ? `Copia dei dati nel PC: aggiornata il ${formattaData(stato.copia.aggiornataIl)}.`
                      : "Nel PC non c'è ancora una copia dei dati."}
                  </p>
                </div>
              </div>
              {collegato && !cambia && (
                <div className="mt-3 flex flex-wrap gap-2 pl-8">
                  <button onClick={() => setCambia(true)} disabled={lavoro} className="btn-ghost !py-1.5 !text-xs">
                    Cambia indirizzo
                  </button>
                  <button
                    onClick={scollega}
                    disabled={lavoro}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-mute transition hover:bg-red-500/10 hover:text-red-700 disabled:opacity-50"
                  >
                    <Unlink className="h-3.5 w-3.5" /> Scollega
                  </button>
                  {stato.linkFoglio && (
                    <a
                      href={stato.linkFoglio}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-mute transition hover:bg-ink-950/5 hover:text-ink-950"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Apri il Foglio
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {mostraIstruzioni && (
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed text-mute">
                Si prepara <B>una volta sola</B> (circa 2 minuti) con il tuo account Google, quello con cui vedi il
                Foglio. Si crea una piccola «antenna» Apps Script nel tuo Drive: il Foglio non va modificato, basta che
                sia condiviso con te.
              </p>
              <ol className="space-y-3">
                <Passo n={1}>
                  Apri{" "}
                  <a
                    href="https://script.google.com/home"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-sky underline-offset-2 hover:underline"
                  >
                    script.google.com
                  </a>{" "}
                  e scegli <B>Nuovo progetto</B> (oppure Drive › Nuovo › Altro › Google Apps Script). Dagli un nome, per
                  esempio «Antenna Banca Dati».
                </Passo>
                <Passo n={2}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>
                      Cancella il codice presente, incolla questo e premi <B>Salva</B>:
                    </span>
                    <button
                      onClick={copiaCodice}
                      disabled={!stato?.codice}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-volt-500 transition hover:bg-ink-900 active:scale-95 disabled:opacity-40"
                    >
                      {copiato ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiato ? "Copiato" : "Copia codice"}
                    </button>
                    <button
                      onClick={() => setMostraCodice((v) => !v)}
                      className="text-[11px] font-semibold text-mute underline-offset-2 hover:underline"
                    >
                      {mostraCodice ? "nascondi" : "mostra"}
                    </button>
                  </div>
                  {stato?.codiceSenzaId && (
                    <p className="mt-1 text-[12px] text-amber-800">
                      Nel codice sostituisci INSERISCI_QUI_L_ID_DEL_FOGLIO con l&apos;ID del Foglio: la parte del suo
                      indirizzo tra <span className="font-mono">/d/</span> e <span className="font-mono">/edit</span>.
                    </p>
                  )}
                  {mostraCodice && (
                    <pre className="mt-2 max-h-48 overflow-auto rounded-xl border border-line bg-paper p-3 font-mono text-[10.5px] leading-snug text-ink-900">
                      {stato?.codice ?? "Codice non trovato nella cartella strumenti."}
                    </pre>
                  )}
                </Passo>
                <Passo n={3}>
                  In alto scegli la funzione <B>prova</B> e premi <B>Esegui</B>, poi <B>Autorizza</B> con il tuo account.
                  Se compare «Google non ha verificato questa app»: <B>Avanzate › Vai a … (non sicuro) › Consenti</B>. In
                  basso deve comparire «Foglio raggiungibile».
                </Passo>
                <Passo n={4}>
                  <B>Esegui il deployment › Nuovo deployment</B>, tipo (icona ingranaggio) <B>App web</B>. Imposta{" "}
                  <B>Esegui come: Me</B> e <B>Chi ha accesso: Chiunque</B>, poi premi <B>Esegui il deployment</B>.
                </Passo>
                <Passo n={5}>
                  Copia l&apos;indirizzo <B>App web</B> (finisce con <span className="font-mono">/exec</span>) e incollalo
                  qui:
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={indirizzo}
                      onChange={(e) => setIndirizzo(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && indirizzo.trim() && !lavoro && void collega()}
                      placeholder="https://script.google.com/macros/s/…/exec"
                      spellCheck={false}
                      className="input min-w-0 flex-1 font-mono !text-xs"
                    />
                    <button
                      onClick={collega}
                      disabled={lavoro || !indirizzo.trim()}
                      className="btn-primary inline-flex items-center justify-center gap-2 !text-xs disabled:opacity-50"
                    >
                      {lavoro ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {lavoro ? "Prova in corso…" : "Collega e prova"}
                    </button>
                  </div>
                  {cambia && (
                    <button
                      onClick={() => setCambia(false)}
                      className="mt-2 text-[11px] font-semibold text-mute underline-offset-2 hover:underline"
                    >
                      Annulla
                    </button>
                  )}
                </Passo>
              </ol>
              <p className="rounded-xl bg-ink-950/[0.04] px-3 py-2 text-[11.5px] leading-relaxed text-mute">
                Il Foglio resta privato. L&apos;indirizzo resta solo in questo PC (file <span className="font-mono">.env.local</span>
                ), non va su GitHub e funziona come una password: non condividerlo. Se ti servisse disattivarlo:
                Apps Script › Esegui il deployment › Gestisci deployment › Archivia.
              </p>
            </div>
          )}

          {esito && (
            <div
              className={`flex items-start gap-2 rounded-xl border p-3 text-[13px] ${
                esito.ok
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-800"
                  : "border-red-500/20 bg-red-500/10 text-red-800"
              }`}
            >
              {esito.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              )}
              <span>{esito.testo}</span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
