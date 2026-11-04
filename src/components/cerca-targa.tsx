"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type KeyboardEvent, type RefObject } from "react";
import Plate from "@/components/plate";
import { cercaPerTarga, normalizzaTarga } from "@/lib/cerca-targa";
import { STATO_LABEL } from "@/lib/format";

type Mezzo = {
  id: number;
  targa: string;
  marca: string;
  modello: string;
  conducente: string | null;
  stato: string;
};

const MAX_RISULTATI = 8;

/** Lente di ingrandimento: si scrive (anche solo una parte del)la targa e si apre la scheda del mezzo */
export default function CercaTarga({
  tema = "scuro",
  inputRef,
  autoFocus = false,
  onChiudi,
}: {
  tema?: "scuro" | "chiaro";
  inputRef?: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  onChiudi?: () => void;
}) {
  const router = useRouter();
  const idLista = useId();
  const [testo, setTesto] = useState("");
  const [mezzi, setMezzi] = useState<Mezzo[] | null>(null);
  const [errore, setErrore] = useState(false);
  const [aperto, setAperto] = useState(false);
  const [evidenziato, setEvidenziato] = useState(0);

  const scuro = tema === "scuro";
  const risultati = mezzi ? cercaPerTarga(mezzi, testo) : [];
  const visibili = risultati.slice(0, MAX_RISULTATI);
  const mostraLista = aperto && normalizzaTarga(testo) !== "";

  // L'elenco si rilegge a ogni apertura della ricerca: così compaiono subito anche i mezzi appena aggiunti
  function caricaMezzi() {
    fetch("/api/cerca-targa", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((dati: Mezzo[]) => {
        setMezzi(dati);
        setErrore(false);
      })
      .catch(() => setErrore(true));
  }

  function apriScheda(mezzo: Mezzo) {
    setTesto("");
    setAperto(false);
    setEvidenziato(0);
    (document.activeElement as HTMLElement | null)?.blur();
    onChiudi?.();
    router.push(`/mezzi/${mezzo.id}`);
  }

  function gestisciTasti(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAperto(true);
      setEvidenziato((i) => Math.min(i + 1, Math.max(visibili.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setEvidenziato((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const scelto = visibili[evidenziato] ?? visibili[0];
      if (scelto) apriScheda(scelto);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (testo) {
        setTesto("");
        setEvidenziato(0);
      } else {
        e.currentTarget.blur();
        onChiudi?.();
      }
    }
  }

  return (
    <div className="relative">
      <Search
        className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${
          scuro ? "text-white/45" : "text-mute"
        }`}
        strokeWidth={2.4}
      />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Cerca per targa"
        aria-expanded={mostraLista}
        aria-controls={idLista}
        aria-autocomplete="list"
        title="Cerca per targa (Ctrl+K)"
        placeholder="Cerca targa…"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        enterKeyHint="search"
        autoFocus={autoFocus}
        value={testo}
        onChange={(e) => {
          setTesto(e.target.value);
          setAperto(true);
          setEvidenziato(0);
          if (!mezzi) caricaMezzi();
        }}
        onFocus={() => {
          setAperto(true);
          caricaMezzi();
        }}
        onBlur={() => setAperto(false)}
        onKeyDown={gestisciTasti}
        className={`h-10 w-full rounded-xl border pl-9 pr-9 font-mono text-sm font-bold uppercase tracking-[0.08em] transition-all placeholder:font-sans placeholder:font-medium placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:ring-[3px] ${
          scuro
            ? "border-white/[0.09] bg-white/[0.05] text-white placeholder:text-white/40 hover:border-white/20 focus:border-volt-500/60 focus:bg-white/[0.08] focus:ring-volt-500/20"
            : "border-line bg-card text-ink-900 placeholder:text-mute/70 focus:border-ink-900/30 focus:ring-volt-500/50"
        }`}
      />
      {testo ? (
        <button
          type="button"
          aria-label="Svuota la ricerca"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setTesto("");
            setEvidenziato(0);
          }}
          className={`absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg transition-colors ${
            scuro ? "text-white/50 hover:bg-white/10 hover:text-white" : "text-mute hover:bg-paper hover:text-ink-900"
          }`}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.6} />
        </button>
      ) : null}

      {mostraLista ? (
        <div
          id={idLista}
          role="listbox"
          aria-label="Mezzi trovati"
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-line bg-card p-1.5 text-ink-900 shadow-[0_2px_6px_rgba(20,22,19,0.12),0_22px_44px_-16px_rgba(20,22,19,0.45)]"
        >
          {mezzi === null ? (
            <p className={`px-3 py-2.5 text-xs ${errore ? "text-danger" : "text-mute"}`}>
              {errore ? "Elenco dei mezzi non disponibile: riprova tra poco." : "Carico i mezzi…"}
            </p>
          ) : visibili.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-mute">
              Nessun mezzo con targa «{testo.trim().toUpperCase()}».
            </p>
          ) : (
            visibili.map((m, i) => (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={i === evidenziato}
                title={`${m.targa} · ${m.marca} ${m.modello}`}
                onMouseEnter={() => setEvidenziato(i)}
                onClick={() => apriScheda(m)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors ${
                  i === evidenziato ? "bg-paper" : ""
                }`}
              >
                <Plate targa={m.targa} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold">
                    {m.marca} {m.modello}
                  </span>
                  <span className="block truncate text-[11px] text-mute">
                    {m.conducente ?? "Non assegnato"}
                    {m.stato !== "attivo" ? ` · ${STATO_LABEL[m.stato] ?? m.stato}` : ""}
                  </span>
                </span>
              </button>
            ))
          )}
          {risultati.length > MAX_RISULTATI ? (
            <p className="px-3 pb-1.5 pt-1 text-[11px] text-mute">
              Altri {risultati.length - MAX_RISULTATI}: continua a scrivere la targa.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
