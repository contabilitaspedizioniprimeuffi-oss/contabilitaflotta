"use client";

import { CheckCircle2, FileJson, Info, Loader2, TriangleAlert, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, type ChangeEvent, type ReactNode } from "react";
import { ModalShell } from "@/components/dialogs";
import Plate from "@/components/plate";
import { fmtDate, fmtEur, fmtNum } from "@/lib/format";
import {
  analizzaJsonPedaggi,
  importaJsonPedaggi,
  type AnteprimaPedaggi,
  type EsitoImportazione,
} from "@/lib/importa-pedaggi";

type Anteprima = Extract<AnteprimaPedaggi, { ok: true }>;
type Esito = Extract<EsitoImportazione, { ok: true }>;

type Stato =
  | { fase: "scelta"; errore?: string }
  | { fase: "lettura"; nome: string }
  | { fase: "errori"; nome: string; errori: string[] }
  | { fase: "anteprima"; nome: string; contenuto: string; a: Anteprima }
  | { fase: "fatto"; esito: Esito };

const MAX_BYTE = 20 * 1024 * 1024;

/** "1 pedaggio" / "3 pedaggi" */
const pl = (n: number, uno: string, tanti: string) => `${fmtNum(n)} ${n === 1 ? uno : tanti}`;
const SCARTA = "scarta";

/** Pulsante «Carica JSON» della sezione Pedaggi: anteprima del file Telepass e importazione */
export default function CaricaJsonPedaggi() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-dark">
        <FileJson className="h-4 w-4" strokeWidth={2.2} /> Carica JSON
      </button>
      {open ? (
        <ModalShell title="Carica JSON pedaggi Telepass" icon={FileJson} onClose={close} wide="xl">
          <Importazione onClose={close} />
        </ModalShell>
      ) : null}
    </>
  );
}

function Importazione({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [stato, setStato] = useState<Stato>({ fase: "scelta" });
  // dispositivo → mezzo scelto per i passaggi senza targa ("" = da scegliere, "scarta", id del mezzo)
  const [scelte, setScelte] = useState<Record<string, string>>({});
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
      setScelte(
        Object.fromEntries(
          a.senzaTarga.map((g) => [g.dispositivo, g.abituale?.vehicleId ? String(g.abituale.vehicleId) : ""])
        )
      );
      setStato({ fase: "anteprima", nome: file.name, contenuto, a });
    } catch {
      setStato({ fase: "scelta", errore: "Non sono riuscito a leggere il file. Riprova." });
    }
  }

  if (stato.fase === "scelta" || stato.fase === "lettura") {
    return (
      <div className="space-y-4">
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
      esito.nonInAnagrafica ? `${fmtNum(esito.nonInAnagrafica)} con targa non in anagrafica` : null,
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
  const assegnato = (disp: string) => /^\d+$/.test(scelte[disp] ?? "");
  const nonInAnagrafica = a.conTarga.filter((g) => g.vehicleId === null);
  const passaggiNonInAnagrafica = nonInAnagrafica.reduce((s, g) => s + g.nuovi, 0);
  const daImportare =
    a.conTarga.filter((g) => g.vehicleId !== null).reduce((s, g) => s + g.nuovi, 0) +
    a.senzaTarga.filter((g) => assegnato(g.dispositivo)).reduce((s, g) => s + g.nuovi, 0);
  const totaleDaImportare =
    a.conTarga.filter((g) => g.vehicleId !== null).reduce((s, g) => s + g.totaleNuovi, 0) +
    a.senzaTarga.filter((g) => assegnato(g.dispositivo)).reduce((s, g) => s + g.totaleNuovi, 0);
  const mancaScelta = a.senzaTarga.some((g) => g.nuovi > 0 && (scelte[g.dispositivo] ?? "") === "");
  const periodo =
    a.fattura.periodoDal && a.fattura.periodoAl
      ? `${fmtDate(a.fattura.periodoDal)} – ${fmtDate(a.fattura.periodoAl)}`
      : "—";

  async function importa() {
    setImportando(true);
    setErroreImport(null);
    try {
      const assegnazioni = Object.fromEntries(
        a.senzaTarga.map((g) => [g.dispositivo, assegnato(g.dispositivo) ? Number(scelte[g.dispositivo]) : null])
      );
      const esito = await importaJsonPedaggi(contenuto, nome, assegnazioni);
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
      {a.giaPresenti > 0 ? (
        <Avviso tipo="info">
          {a.giaPresenti === 1
            ? "1 passaggio di questo file è già nel programma: non verrà caricato di nuovo."
            : `${fmtNum(a.giaPresenti)} passaggi di questo file sono già nel programma: non verranno caricati di nuovo.`}
        </Avviso>
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
                {a.conTarga.map((g) => (
                  <tr key={g.targa}>
                    <td className="td py-2.5">
                      <Plate targa={g.targa} size="sm" />
                    </td>
                    <td className="td py-2.5">
                      {g.mezzo ?? (
                        <span className="rounded-full bg-amber/15 px-2.5 py-1 text-xs font-bold text-amber-900">
                          non in anagrafica
                        </span>
                      )}
                    </td>
                    <td className="td py-2.5 text-right font-mono">{fmtNum(g.passaggi)}</td>
                    <td className="td py-2.5 text-right font-mono">{fmtEur(g.totale, 2)}</td>
                    <td className="td py-2.5 text-xs">
                      {g.vehicleId === null ? (
                        <span className="font-semibold text-amber-900">per ora non importati</span>
                      ) : g.nuovi === 0 ? (
                        <span className="text-mute">già presenti</span>
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
                ))}
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
                            value={scelte[g.dispositivo] ?? ""}
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
                            <option value={SCARTA}>Non importare questi passaggi</option>
                          </select>
                          <span className="mt-1 block text-[11px] text-mute">
                            {g.abituale
                              ? g.abituale.vehicleId
                                ? `Di solito ${g.abituale.targa} (${g.abituale.fonte === "file" ? "dalle altre righe del file" : "dai pedaggi già registrati"})`
                                : `Di solito ${g.abituale.targa}, che non è in anagrafica: scegli tu`
                              : "Nessuna targa abituale per questo dispositivo: scegli tu"}
                          </span>
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

      {nonInAnagrafica.length > 0 ? (
        <Avviso tipo="attenzione">
          {nonInAnagrafica.length === 1 ? "Targa non in anagrafica" : "Targhe non in anagrafica"}:{" "}
          <b>{nonInAnagrafica.map((g) => g.targa).join(", ")}</b>. Per ora {nonInAnagrafica.length === 1 ? "i suoi" : "i loro"} passaggi (
          {fmtNum(passaggiNonInAnagrafica)}) non vengono importati: con la prossima modifica potrai scegliere se
          aggiungere {nonInAnagrafica.length === 1 ? "la targa" : "le targhe"} in anagrafica.
        </Avviso>
      ) : null}

      {erroreImport ? <Avviso tipo="errore">{erroreImport}</Avviso> : null}

      {/* sempre visibile in fondo alla finestra, anche con file lunghi */}
      <div className="sticky -bottom-5 z-10 -mx-6 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-card px-6 py-4">
        <p className="text-sm">
          {daImportare === 1 ? "Verrà importato " : "Verranno importati "}
          <b>{pl(daImportare, "pedaggio", "pedaggi")}</b> · <b>{fmtEur(totaleDaImportare, 2)}</b>
          {mancaScelta ? (
            <span className="block text-xs font-semibold text-amber-900">
              Scegli a quale mezzo assegnare i passaggi senza targa (oppure «Non importare»).
            </span>
          ) : null}
        </p>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setStato({ fase: "scelta" })} disabled={importando}>
            Scegli un altro file
          </button>
          <button
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            onClick={importa}
            disabled={daImportare === 0 || mancaScelta || importando}
          >
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importa {pl(daImportare, "pedaggio", "pedaggi")}
          </button>
        </div>
      </div>
    </div>
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
