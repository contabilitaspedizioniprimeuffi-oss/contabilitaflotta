"use client";

import { Ban, CheckCircle2, FileJson, Info, Loader2, PlusCircle, TriangleAlert, Undo2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, type ChangeEvent, type ReactNode } from "react";
import { ModalShell } from "@/components/dialogs";
import Plate from "@/components/plate";
import type { ImportazioneFatta } from "@/lib/data";
import { CATEGORIA_LABEL, fmtDate, fmtEur, fmtNum } from "@/lib/format";
import {
  analizzaJsonPedaggi,
  annullaImportazionePedaggi,
  importaJsonPedaggi,
  type AnteprimaPedaggi,
  type DecisioneTarga,
  type EsitoImportazione,
  type GruppoDispositivo,
} from "@/lib/importa-pedaggi";

type Anteprima = Extract<AnteprimaPedaggi, { ok: true }>;
type Esito = Extract<EsitoImportazione, { ok: true }>;

type Stato =
  | { fase: "scelta"; errore?: string }
  | { fase: "lettura"; nome: string }
  | { fase: "errori"; nome: string; errori: string[] }
  | { fase: "anteprima"; nome: string; contenuto: string; a: Anteprima }
  | { fase: "fatto"; esito: Esito };

type DatiMezzoNuovo = { marca: string; modello: string; categoria: string };
const DATI_VUOTI: DatiMezzoNuovo = { marca: "", modello: "", categoria: "furgone" };

const MAX_BYTE = 20 * 1024 * 1024;
const SCARTA = "scarta";
const NUOVA = "nuova:"; // valore della tendina per una targa nuova, es. "nuova:AB123CD"

/** "1 pedaggio" / "3 pedaggi" */
const pl = (n: number, uno: string, tanti: string) => `${fmtNum(n)} ${n === 1 ? uno : tanti}`;
const centesimi = (x: number) => Math.round(x * 100) / 100;
const somma = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

/** "6 nov 2026, 10:12" */
function quando(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Pulsante «Carica JSON» della sezione Pedaggi: anteprima del file Telepass e importazione */
export default function CaricaJsonPedaggi({ importazioni }: { importazioni: ImportazioneFatta[] }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-dark">
        <FileJson className="h-4 w-4" strokeWidth={2.2} /> Carica JSON
      </button>
      {open ? (
        <ModalShell title="Carica JSON pedaggi Telepass" icon={FileJson} onClose={close} wide="xl">
          <Importazione onClose={close} importazioni={importazioni} />
        </ModalShell>
      ) : null}
    </>
  );
}

function Importazione({ onClose, importazioni }: { onClose: () => void; importazioni: ImportazioneFatta[] }) {
  const router = useRouter();
  const [stato, setStato] = useState<Stato>({ fase: "scelta" });
  // dispositivo → scelta fatta a mano nella tendina (id del mezzo, "nuova:TARGA" o "scarta")
  const [scelte, setScelte] = useState<Record<string, string>>({});
  // targa non in anagrafica → aggiungere o scartare
  const [decisioni, setDecisioni] = useState<Record<string, "aggiungi" | "scarta">>({});
  const [datiNuovi, setDatiNuovi] = useState<Record<string, DatiMezzoNuovo>>({});
  const [confermaRipetuta, setConfermaRipetuta] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erroreImport, setErroreImport] = useState<string | null>(null);

  async function scegliFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTE) return setStato({ fase: "scelta", errore: "Il file è troppo grande (massimo 20 MB)." });
    setStato({ fase: "lettura", nome: file.name });
    setErroreImport(null);
    try {
      const contenuto = await file.text();
      const a = await analizzaJsonPedaggi(contenuto);
      if (!a.ok) return setStato({ fase: "errori", nome: file.name, errori: a.errori });
      setScelte({});
      setDecisioni({});
      setDatiNuovi({});
      setConfermaRipetuta(false);
      setStato({ fase: "anteprima", nome: file.name, contenuto, a });
    } catch {
      setStato({ fase: "scelta", errore: "Non sono riuscito a leggere il file. Riprova." });
    }
  }

  if (stato.fase === "scelta" || stato.fase === "lettura") {
    return (
      <div className="space-y-5">
        <label
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-paper/60 px-6 py-12 text-center transition-colors hover:border-ink-900/30 ${
            stato.fase === "lettura" ? "pointer-events-none opacity-70" : ""
          }`}
        >
          {stato.fase === "lettura" ? (
            <Loader2 className="h-8 w-8 animate-spin text-mute" />
          ) : (
            <Upload className="h-8 w-8 text-mute" strokeWidth={1.8} />
          )}
          <span className="text-base font-bold">
            {stato.fase === "lettura" ? `Controllo ${stato.nome}…` : "Scegli il file JSON"}
          </span>
          <span className="max-w-md text-xs text-mute">
            È il file creato dal convertitore a partire dal PDF della fattura Telepass. Prima di salvare
            ti mostro un&apos;anteprima.
          </span>
          <input type="file" accept=".json,application/json" className="sr-only" onChange={scegliFile} disabled={stato.fase === "lettura"} />
        </label>
        {stato.fase === "scelta" && stato.errore ? <Avviso tipo="errore">{stato.errore}</Avviso> : null}
        <ElencoImportazioni importazioni={importazioni} />
      </div>
    );
  }

  if (stato.fase === "errori") {
    return (
      <div className="space-y-4">
        <Avviso tipo="errore">
          <p className="font-bold">Il file «{stato.nome}» non si può caricare:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {stato.errori.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">Non è stato salvato niente. Il formato giusto è descritto nella guida per il convertitore.</p>
        </Avviso>
        <div className="flex justify-end">
          <button className="btn-ghost" onClick={() => setStato({ fase: "scelta" })}>
            Scegli un altro file
          </button>
        </div>
      </div>
    );
  }

  if (stato.fase === "fatto") {
    const { esito } = stato;
    const esclusi = [
      esito.giaPresenti ? pl(esito.giaPresenti, "già presente", "già presenti") : null,
      esito.scartati ? pl(esito.scartati, "scartato", "scartati") : null,
    ].filter(Boolean);
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-2xl border border-volt-500/30 bg-volt-500/10 px-5 py-4">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-volt-700" />
          <div>
            <p className="text-base font-bold">
              {esito.importati === 1 ? "Importato" : "Importati"} {pl(esito.importati, "pedaggio", "pedaggi")} ·{" "}
              {fmtEur(esito.totale, 2)}
            </p>
            <p className="mt-1 text-sm text-mute">
              {esclusi.length ? `Non importati: ${esclusi.join(", ")}.` : "Tutti i passaggi del file sono stati importati."}
            </p>
            {esito.targheAggiunte.length > 0 ? (
              <p className="mt-1 text-sm">
                {esito.targheAggiunte.length === 1 ? "Aggiunta in anagrafica la targa " : "Aggiunte in anagrafica le targhe "}
                <b>{esito.targheAggiunte.join(", ")}</b>: completa la scheda da «Mezzi».
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Chiudi
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              router.push(`/pedaggi?mese=${esito.mese}`);
              onClose();
            }}
          >
            Vedi i pedaggi importati
          </button>
        </div>
      </div>
    );
  }

  // Anteprima
  const { a, contenuto, nome } = stato;
  const registrate = a.conTarga.filter((g) => g.vehicleId !== null);
  const nonInAnagrafica = a.conTarga.filter((g) => g.vehicleId === null && g.nuovi > 0);
  const aggiunte = nonInAnagrafica.filter((g) => decisioni[g.targa] === "aggiungi");

  /** Scelta per i passaggi senza targa di un dispositivo: quella fatta a mano, altrimenti la targa abituale */
  function valoreDispositivo(g: GruppoDispositivo): string {
    const s = scelte[g.dispositivo];
    if (s !== undefined) return s.startsWith(NUOVA) && decisioni[s.slice(NUOVA.length)] !== "aggiungi" ? "" : s;
    const ab = g.abituale;
    if (!ab) return "";
    if (ab.vehicleId) return String(ab.vehicleId);
    if (decisioni[ab.targa] === "aggiungi") return NUOVA + ab.targa;
    if (decisioni[ab.targa] === "scarta") return SCARTA;
    return "";
  }
  const siImporta = (g: GruppoDispositivo) => {
    const v = valoreDispositivo(g);
    return /^\d+$/.test(v) || v.startsWith(NUOVA);
  };
  function suggerimento(g: GruppoDispositivo) {
    const ab = g.abituale;
    if (!ab) return "Nessuna targa abituale per questo dispositivo: scegli tu";
    const fonte = ab.fonte === "file" ? "dalle altre righe del file" : "dai pedaggi già registrati";
    if (ab.vehicleId) return `Di solito ${ab.targa} (${fonte})`;
    if (decisioni[ab.targa] === "aggiungi") return `Di solito ${ab.targa} (${fonte}), che aggiungi in anagrafica`;
    if (decisioni[ab.targa] === "scarta") return `Di solito ${ab.targa}, di cui hai scartato i pedaggi`;
    return `Di solito ${ab.targa}, che non è in anagrafica: decidi sopra cosa farne`;
  }

  const senzaTargaImportati = a.senzaTarga.filter(siImporta);
  const daImportare =
    somma(registrate, (g) => g.nuovi) + somma(aggiunte, (g) => g.nuovi) + somma(senzaTargaImportati, (g) => g.nuovi);
  const totaleDaImportare = centesimi(
    somma(registrate, (g) => g.totaleNuovi) + somma(aggiunte, (g) => g.totaleNuovi) + somma(senzaTargaImportati, (g) => g.totaleNuovi)
  );
  const mancaDecisione = nonInAnagrafica.some((g) => !decisioni[g.targa]);
  const mancaScelta = a.senzaTarga.some((g) => g.nuovi > 0 && valoreDispositivo(g) === "");
  const nienteDiNuovo = a.giaPresenti === a.passaggi;
  const mancaConferma = a.giaImportata !== null && !confermaRipetuta;
  const pronto = daImportare > 0 && !mancaDecisione && !mancaScelta && !mancaConferma && !importando;
  const motivo = mancaDecisione
    ? "Decidi cosa fare con le targhe non in anagrafica."
    : mancaScelta
      ? "Scegli a quale mezzo assegnare i passaggi senza targa (oppure «Non importare»)."
      : mancaConferma && !nienteDiNuovo
        ? "Conferma sopra che vuoi aggiungere i passaggi mancanti di una fattura già importata."
        : null;
  const periodo =
    a.fattura.periodoDal && a.fattura.periodoAl
      ? `${fmtDate(a.fattura.periodoDal)} – ${fmtDate(a.fattura.periodoAl)}`
      : "—";

  const decidi = (targa: string, d: "aggiungi" | "scarta") => setDecisioni((s) => ({ ...s, [targa]: d }));
  const cambiaDati = (targa: string, campo: keyof DatiMezzoNuovo, valore: string) =>
    setDatiNuovi((s) => ({ ...s, [targa]: { ...(s[targa] ?? DATI_VUOTI), [campo]: valore } }));

  async function importa() {
    setImportando(true);
    setErroreImport(null);
    try {
      const assegnazioni = Object.fromEntries(
        a.senzaTarga.map((g) => {
          const v = valoreDispositivo(g);
          return [g.dispositivo, /^\d+$/.test(v) ? Number(v) : v.startsWith(NUOVA) ? { targaNuova: v.slice(NUOVA.length) } : null];
        })
      );
      const targheNuove: Record<string, DecisioneTarga> = Object.fromEntries(
        nonInAnagrafica
          .filter((g) => decisioni[g.targa])
          .map((g) => [
            g.targa,
            decisioni[g.targa] === "aggiungi"
              ? { azione: "aggiungi" as const, ...(datiNuovi[g.targa] ?? DATI_VUOTI) }
              : { azione: "scarta" as const },
          ])
      );
      const esito = await importaJsonPedaggi(contenuto, nome, {
        assegnazioni,
        targheNuove,
        confermaFatturaGiaImportata: confermaRipetuta,
      });
      if (!esito.ok) {
        setErroreImport(esito.errori.join(" "));
        return;
      }
      setStato({ fase: "fatto", esito });
      router.refresh();
    } catch {
      setErroreImport("Importazione non riuscita: non è stato salvato niente. Riprova.");
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-paper/60 p-4 sm:grid-cols-4">
        <Dato etichetta="Fattura" valore={`n. ${a.fattura.numero}`} sotto={a.fattura.data ? `del ${fmtDate(a.fattura.data)}` : undefined} />
        <Dato etichetta="Periodo" valore={periodo} />
        <Dato etichetta="Passaggi nel file" valore={fmtNum(a.passaggi)} sotto={`${fmtNum(a.dispositivi)} dispositivi`} />
        <Dato etichetta="Totale nel file" valore={fmtEur(a.totale, 2)} sotto="IVA inclusa" />
      </div>

      <p className="flex items-center gap-2 text-sm font-semibold text-volt-700">
        <CheckCircle2 className="h-4 w-4" /> I totali di tutti i dispositivi corrispondono al PDF.
      </p>
      {a.avvisi.map((x, i) => (
        <Avviso key={i} tipo="attenzione">
          {x}
        </Avviso>
      ))}

      {a.giaImportata ? (
        <Avviso tipo="errore">
          <p className="font-bold">
            Questa fattura è già stata importata
            {a.giaImportata.volte > 1 ? ` ${a.giaImportata.volte} volte (l'ultima il ` : " il "}
            {quando(a.giaImportata.il)}
            {a.giaImportata.volte > 1 ? ")" : ""}.
          </p>
          <p className="mt-1">
            Per evitare doppioni i passaggi già presenti nel programma ({fmtNum(a.giaPresenti)} su {fmtNum(a.passaggi)})
            vengono saltati.{nienteDiNuovo ? " Non c'è niente di nuovo da importare." : ""}
          </p>
          {!nienteDiNuovo ? (
            <label className="mt-2 flex cursor-pointer items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-current"
                checked={confermaRipetuta}
                onChange={(e) => setConfermaRipetuta(e.target.checked)}
              />
              Ho capito: aggiungi solo i passaggi che mancano
            </label>
          ) : null}
        </Avviso>
      ) : a.giaPresenti > 0 ? (
        <Avviso tipo="info">
          {a.giaPresenti === 1
            ? "1 passaggio di questo file è già nel programma: non verrà caricato di nuovo."
            : `${fmtNum(a.giaPresenti)} passaggi di questo file sono già nel programma: non verranno caricati di nuovo.`}
        </Avviso>
      ) : null}

      {nonInAnagrafica.length > 0 ? (
        <section className="rounded-2xl border border-amber/40 bg-amber/10 p-4">
          <p className="flex items-center gap-2 text-sm font-bold">
            <TriangleAlert className="h-4 w-4 shrink-0 text-amber" />
            {nonInAnagrafica.length === 1
              ? "1 targa non è in anagrafica"
              : `${fmtNum(nonInAnagrafica.length)} targhe non sono in anagrafica`}
            : prima di importare decidi cosa fare.
          </p>
          <div className="mt-3 space-y-2.5">
            {nonInAnagrafica.map((g) => {
              const d = decisioni[g.targa];
              const dati = datiNuovi[g.targa] ?? DATI_VUOTI;
              return (
                <div key={g.targa} className="rounded-xl border border-line bg-card p-3" data-targa-nuova={g.targa}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Plate targa={g.targa} size="sm" />
                      <span className="text-sm">
                        {pl(g.nuovi, "passaggio", "passaggi")} · <b>{fmtEur(g.totaleNuovi, 2)}</b>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        aria-pressed={d === "aggiungi"}
                        aria-label={`Aggiungi ${g.targa} in anagrafica`}
                        onClick={() => decidi(g.targa, "aggiungi")}
                        className={`${d === "aggiungi" ? "btn-dark" : "btn-ghost"} h-9! text-xs`}
                      >
                        <PlusCircle className="h-4 w-4" /> Aggiungi in anagrafica
                      </button>
                      <button
                        type="button"
                        aria-pressed={d === "scarta"}
                        aria-label={`Scarta i pedaggi di ${g.targa}`}
                        onClick={() => decidi(g.targa, "scarta")}
                        className={`${d === "scarta" ? "btn-dark" : "btn-ghost"} h-9! text-xs`}
                      >
                        <Ban className="h-4 w-4" /> Scarta i suoi pedaggi
                      </button>
                    </div>
                  </div>
                  {d === "aggiungi" ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <input
                        className="input h-10!"
                        placeholder="Marca (es. Fiat)"
                        aria-label={`Marca di ${g.targa}`}
                        maxLength={60}
                        value={dati.marca}
                        onChange={(e) => cambiaDati(g.targa, "marca", e.target.value)}
                      />
                      <input
                        className="input h-10!"
                        placeholder="Modello (es. Ducato)"
                        aria-label={`Modello di ${g.targa}`}
                        maxLength={80}
                        value={dati.modello}
                        onChange={(e) => cambiaDati(g.targa, "modello", e.target.value)}
                      />
                      <select
                        className="input h-10!"
                        aria-label={`Tipo di ${g.targa}`}
                        value={dati.categoria}
                        onChange={(e) => cambiaDati(g.targa, "categoria", e.target.value)}
                      >
                        {Object.entries(CATEGORIA_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-mute sm:col-span-3">
                        Marca e modello sono facoltativi: potrai completare la scheda dopo, da «Mezzi».
                      </p>
                    </div>
                  ) : d === "scarta" ? (
                    <p className="mt-2 text-xs text-mute">I pedaggi di {g.targa} non verranno importati.</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {a.conTarga.length > 0 ? (
        <section>
          <h4 className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em]">Passaggi con la targa nel file</h4>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="th">Targa</th>
                  <th className="th">Mezzo</th>
                  <th className="th text-right">Passaggi</th>
                  <th className="th text-right">Importo</th>
                  <th className="th">Esito</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {a.conTarga.map((g) => {
                  const d = g.vehicleId === null ? decisioni[g.targa] : undefined;
                  return (
                    <tr key={g.targa}>
                      <td className="td py-2.5">
                        <Plate targa={g.targa} size="sm" />
                      </td>
                      <td className="td py-2.5">
                        {g.mezzo ??
                          (d === "aggiungi" ? (
                            <span className="rounded-full bg-volt-500/20 px-2.5 py-1 text-xs font-bold">nuova in anagrafica</span>
                          ) : (
                            <span className="rounded-full bg-amber/15 px-2.5 py-1 text-xs font-bold text-amber-900">
                              non in anagrafica
                            </span>
                          ))}
                      </td>
                      <td className="td py-2.5 text-right font-mono">{fmtNum(g.passaggi)}</td>
                      <td className="td py-2.5 text-right font-mono">{fmtEur(g.totale, 2)}</td>
                      <td className="td py-2.5 text-xs">
                        {g.nuovi === 0 ? (
                          <span className="text-mute">già presenti</span>
                        ) : g.vehicleId === null && d === undefined ? (
                          <span className="font-semibold text-amber-900">da decidere</span>
                        ) : d === "scarta" ? (
                          <span className="text-mute">scartati</span>
                        ) : (
                          <span className="font-semibold">
                            {fmtNum(g.nuovi)} da importare
                            {g.giaPresenti ? (
                              <span className="font-normal text-mute"> · {pl(g.giaPresenti, "già presente", "già presenti")}</span>
                            ) : null}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {a.senzaTarga.length > 0 ? (
        <section>
          <h4 className="mb-1 text-xs font-extrabold uppercase tracking-[0.14em]">
            Passaggi senza targa nel file <span className="text-base text-amber">*</span>
          </h4>
          <p className="mb-2 text-xs text-mute">
            Li assegno al mezzo che di solito usa il dispositivo e li segno con l&apos;asterisco. Puoi scegliere un altro
            mezzo o non importarli. Dopo, la targa si può cambiare anche dal singolo pedaggio.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="th">Dispositivo</th>
                  <th className="th text-right">Passaggi</th>
                  <th className="th text-right">Importo</th>
                  <th className="th">Assegna a</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {a.senzaTarga.map((g) => (
                  <tr key={g.dispositivo} className="align-top">
                    <td className="td py-2.5 font-mono text-xs" title={g.dispositivo}>
                      {g.dispositivo.split("/")[0]}
                    </td>
                    <td className="td py-2.5 text-right font-mono">
                      {fmtNum(g.passaggi)}
                      {g.giaPresenti ? (
                        <span className="block text-[11px] text-mute">{pl(g.giaPresenti, "già presente", "già presenti")}</span>
                      ) : null}
                    </td>
                    <td className="td py-2.5 text-right font-mono">{fmtEur(g.totale, 2)}</td>
                    <td className="td py-2.5">
                      {g.nuovi === 0 ? (
                        <span className="text-xs text-mute">già presenti</span>
                      ) : (
                        <>
                          <select
                            className="input h-10!"
                            aria-label={`Mezzo per il dispositivo ${g.dispositivo.split("/")[0]}`}
                            value={valoreDispositivo(g)}
                            onChange={(e) => setScelte((s) => ({ ...s, [g.dispositivo]: e.target.value }))}
                          >
                            <option value="" disabled>
                              Scegli la targa…
                            </option>
                            {a.mezzi.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.targa} — {m.marca} {m.modello}
                                {m.venduto ? " (venduto)" : ""}
                              </option>
                            ))}
                            {aggiunte.length > 0 ? (
                              <optgroup label="Targhe da aggiungere in anagrafica">
                                {aggiunte.map((t) => (
                                  <option key={t.targa} value={NUOVA + t.targa}>
                                    {t.targa} — nuova in anagrafica
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                            <option value={SCARTA}>Non importare questi passaggi</option>
                          </select>
                          <span className="mt-1 block text-[11px] text-mute">{suggerimento(g)}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {erroreImport ? <Avviso tipo="errore">{erroreImport}</Avviso> : null}

      {/* sempre visibile in fondo alla finestra, anche con file lunghi */}
      <div className="sticky -bottom-5 z-10 -mx-6 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-card px-6 py-4">
        <p className="text-sm">
          {daImportare === 1 ? "Verrà importato " : "Verranno importati "}
          <b>{pl(daImportare, "pedaggio", "pedaggi")}</b> · <b>{fmtEur(totaleDaImportare, 2)}</b>
          {aggiunte.length > 0 && !mancaDecisione ? (
            <span className="text-mute"> · nuove in anagrafica: {aggiunte.map((g) => g.targa).join(", ")}</span>
          ) : null}
          {motivo ? <span className="block text-xs font-semibold text-amber-900">{motivo}</span> : null}
        </p>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setStato({ fase: "scelta" })} disabled={importando}>
            Scegli un altro file
          </button>
          <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" onClick={importa} disabled={!pronto}>
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {a.giaImportata ? "Aggiungi " : "Importa "}
            {pl(daImportare, "pedaggio", "pedaggi")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Ultime fatture importate, con «Annulla» per togliere tutti i pedaggi di un'importazione sbagliata */
function ElencoImportazioni({ importazioni }: { importazioni: ImportazioneFatta[] }) {
  const router = useRouter();
  const [daAnnullare, setDaAnnullare] = useState<number | null>(null);
  const [lavoro, setLavoro] = useState(false);
  const [messaggio, setMessaggio] = useState<{ tipo: "info" | "errore"; testo: string } | null>(null);

  async function annulla(id: number) {
    setLavoro(true);
    setMessaggio(null);
    try {
      const r = await annullaImportazionePedaggi(id);
      if (!r.ok) setMessaggio({ tipo: "errore", testo: r.errore });
      else {
        setMessaggio({ tipo: "info", testo: `Importazione annullata: ${r.eliminati === 1 ? "eliminato" : "eliminati"} ${pl(r.eliminati, "pedaggio", "pedaggi")}.` });
        router.refresh();
      }
    } catch {
      setMessaggio({ tipo: "errore", testo: "Annullamento non riuscito: non è stato eliminato niente. Riprova." });
    } finally {
      setLavoro(false);
      setDaAnnullare(null);
    }
  }

  const avviso = messaggio ? (
    <div className="mt-2">
      <Avviso tipo={messaggio.tipo}>{messaggio.testo}</Avviso>
    </div>
  ) : null;
  // dopo l'ultimo «Annulla» l'elenco è vuoto: resta solo il messaggio
  if (importazioni.length === 0) return avviso;

  return (
    <section>
      <h4 className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em]">Fatture già importate</h4>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-line">
              <th className="th">Fattura</th>
              <th className="th">Periodo</th>
              <th className="th text-right">Pedaggi</th>
              <th className="th text-right">Totale</th>
              <th className="th">Importata il</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {importazioni.map((imp) => (
              <tr key={imp.id}>
                <td className="td py-2.5">
                  <span className="font-mono text-sm font-bold">n. {imp.fatturaNumero}</span>
                  {imp.fileNome ? <span className="block max-w-[180px] truncate text-[11px] text-mute">{imp.fileNome}</span> : null}
                </td>
                <td className="td py-2.5 text-xs">
                  {imp.periodoDal && imp.periodoAl ? `${fmtDate(imp.periodoDal)} – ${fmtDate(imp.periodoAl)}` : "—"}
                </td>
                <td className="td py-2.5 text-right font-mono">{fmtNum(imp.pedaggi)}</td>
                <td className="td py-2.5 text-right font-mono">{fmtEur(imp.totale, 2)}</td>
                <td className="td py-2.5 text-xs">{quando(imp.il)}</td>
                <td className="td py-2.5 text-right">
                  {daAnnullare === imp.id ? (
                    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      <span className="text-xs font-semibold text-red-800">
                        Elimino {imp.pedaggi === 1 ? "il suo pedaggio" : `i suoi ${fmtNum(imp.pedaggi)} pedaggi`}?
                      </span>
                      <button className="btn-ghost h-8! px-3! text-xs" onClick={() => setDaAnnullare(null)} disabled={lavoro}>
                        No
                      </button>
                      <button
                        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-danger px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                        onClick={() => annulla(imp.id)}
                        disabled={lavoro}
                      >
                        {lavoro ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Sì, elimina
                      </button>
                    </span>
                  ) : (
                    <button
                      className="btn-ghost h-8! px-3! text-xs"
                      onClick={() => setDaAnnullare(imp.id)}
                      aria-label={`Annulla l'importazione della fattura ${imp.fatturaNumero}`}
                    >
                      <Undo2 className="h-3.5 w-3.5" /> Annulla
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] text-mute">
        «Annulla» elimina tutti i pedaggi caricati con quell&apos;importazione (i mezzi aggiunti in anagrafica restano).
      </p>
      {avviso}
    </section>
  );
}

function Dato({ etichetta, valore, sotto }: { etichetta: string; valore: string; sotto?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-mute">{etichetta}</p>
      <p className="mt-1 font-mono text-sm font-bold">{valore}</p>
      {sotto ? <p className="text-[11px] text-mute">{sotto}</p> : null}
    </div>
  );
}

function Avviso({ tipo, children }: { tipo: "errore" | "attenzione" | "info"; children: ReactNode }) {
  const stile =
    tipo === "errore"
      ? "border-red-500/20 bg-red-500/10 text-red-800"
      : tipo === "attenzione"
        ? "border-amber/30 bg-amber/10 text-ink-900"
        : "border-sky/20 bg-sky/10 text-ink-900";
  const Icona = tipo === "info" ? Info : TriangleAlert;
  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm ${stile}`}>
      <Icona className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
