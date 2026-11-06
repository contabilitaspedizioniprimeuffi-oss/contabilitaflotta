import Link from "next/link";
import { DeleteTollButton, EditTollButton, MezziPerPedaggi, type MezzoDaScegliere } from "@/components/dialogs";
import Plate from "@/components/plate";
import type { Toll } from "@/db/schema";
import { fmtDate, fmtEur } from "@/lib/format";
import { importoPedaggio } from "@/lib/pedaggi";

export type RigaPedaggio = { p: Toll; targa?: string };

const SPIEGAZIONE_ASTERISCO =
  "Nel file Telepass mancava la targa: il passaggio è stato assegnato al mezzo che di solito usa quel dispositivo.";

function Asterisco() {
  return (
    <span
      className="ml-1 cursor-help align-top font-mono text-lg font-black leading-none text-amber"
      title={SPIEGAZIONE_ASTERISCO}
      aria-label="Targa assegnata in base al dispositivo"
    >
      *
    </span>
  );
}

/** Elenco pedaggi con le colonne del dettaglio Telepass; importi IVA inclusa come nel PDF */
export default function TabellaPedaggi({
  righe,
  mostraTarga,
  mezzi,
  totale,
  etichettaTotale,
}: {
  righe: RigaPedaggio[];
  mostraTarga: boolean;
  /** mezzi tra cui scegliere quando si cambia la targa di un pedaggio */
  mezzi: MezzoDaScegliere[];
  totale?: number;
  etichettaTotale?: string;
}) {
  const colonne = mostraTarga ? 9 : 8;
  const conAsterisco = righe.some(({ p }) => p.targaDalDispositivo);
  return (
    <MezziPerPedaggi mezzi={mezzi}>
      <div className="overflow-x-auto">
        <table className={`w-full ${mostraTarga ? "min-w-[1060px]" : "min-w-[960px]"}`}>
          <thead>
            <tr className="border-b border-line">
              <th className="th">Uscita</th>
              {mostraTarga ? <th className="th">Targa</th> : null}
              <th className="th">Stazione entrata</th>
              <th className="th">Stazione uscita</th>
              <th className="th">Classe</th>
              <th className="th">SRV</th>
              <th className="th">Dispositivo</th>
              <th className="th text-right">Importo</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {righe.map(({ p, targa }) => (
              <tr key={p.id} className="align-top transition-colors hover:bg-paper/60">
                <td className="td whitespace-nowrap">
                  <span className="block font-semibold">{fmtDate(p.dataUscita)}</span>
                  {p.oraUscita ? <span className="block font-mono text-[11px] text-mute">{p.oraUscita}</span> : null}
                </td>
                {mostraTarga ? (
                  <td className="td whitespace-nowrap">
                    <Link href={`/mezzi/${p.vehicleId}`} className="inline-block hover:opacity-80" title="Apri la scheda del mezzo">
                      <Plate targa={targa ?? "—"} size="sm" />
                    </Link>
                    {p.targaDalDispositivo ? <Asterisco /> : null}
                  </td>
                ) : null}
                <td className="td">
                  <span className="block font-semibold">{p.stazioneEntrata ?? "—"}</span>
                  {p.dataEntrata ? (
                    <span className="block font-mono text-[11px] text-mute">
                      {fmtDate(p.dataEntrata)}
                      {p.oraEntrata ? ` ${p.oraEntrata}` : ""}
                    </span>
                  ) : null}
                </td>
                <td className="td font-semibold">{p.stazioneUscita ?? "—"}</td>
                <td className="td font-mono text-xs font-bold">{p.classe ?? "—"}</td>
                <td className="td font-mono text-xs">{p.servizio ?? "—"}</td>
                <td className="td font-mono text-[11px] text-mute" title={p.dispositivo ?? undefined}>
                  {p.dispositivo ? p.dispositivo.split("/")[0] : "—"}
                  {!mostraTarga && p.targaDalDispositivo ? <Asterisco /> : null}
                  {p.idPrenotazione ? <span className="block">pren. {p.idPrenotazione}</span> : null}
                </td>
                <td className="td whitespace-nowrap text-right font-mono text-sm font-bold">
                  {fmtEur(importoPedaggio(p), 2)}
                </td>
                <td className="td">
                  <div className="flex items-center justify-end gap-1">
                    <EditTollButton initial={p} />
                    <DeleteTollButton id={p.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {totale !== undefined ? (
            <tfoot>
              <tr className="border-t border-line bg-paper/60">
                <td className="td text-xs font-bold uppercase tracking-wide" colSpan={colonne - 2}>
                  {etichettaTotale ?? "Totale"}
                </td>
                <td className="td text-right font-mono text-sm font-black">{fmtEur(totale, 2)}</td>
                <td className="td" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {conAsterisco ? (
        <p className="border-t border-line px-5 py-2.5 text-xs text-mute">
          <span className="mr-1 font-mono text-base font-black text-amber">*</span>
          {SPIEGAZIONE_ASTERISCO} Se è sbagliato, cambia la targa con la matita.
        </p>
      ) : null}
    </MezziPerPedaggi>
  );
}
