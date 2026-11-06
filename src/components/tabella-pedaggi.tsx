import Link from "next/link";
import { DeleteTollButton, EditTollButton } from "@/components/dialogs";
import Plate from "@/components/plate";
import type { Toll } from "@/db/schema";
import { fmtDate, fmtEur } from "@/lib/format";
import { importoConIva, IVA_PEDAGGI_PREDEFINITA } from "@/lib/pedaggi";

export type RigaPedaggio = { p: Toll; targa?: string };

/** Elenco pedaggi con le colonne del dettaglio Telepass; importi mostrati IVA inclusa */
export default function TabellaPedaggi({
  righe,
  mostraTarga,
  totale,
  etichettaTotale,
}: {
  righe: RigaPedaggio[];
  mostraTarga: boolean;
  totale?: number;
  etichettaTotale?: string;
}) {
  const colonne = mostraTarga ? 9 : 8;
  return (
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
            <th className="th text-right">Importo IVA incl.</th>
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
                <td className="td">
                  <Link href={`/mezzi/${p.vehicleId}`} className="inline-block hover:opacity-80" title="Apri la scheda del mezzo">
                    <Plate targa={targa ?? "—"} size="sm" />
                  </Link>
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
                {p.idPrenotazione ? <span className="block">pren. {p.idPrenotazione}</span> : null}
              </td>
              <td className="td whitespace-nowrap text-right">
                <span className="block font-mono text-sm font-bold">{fmtEur(importoConIva(p.importo, p.iva), 2)}</span>
                <span className="block font-mono text-[11px] text-mute">
                  {fmtEur(Number(p.importo), 2)} + IVA {p.iva ?? IVA_PEDAGGI_PREDEFINITA}%
                </span>
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
  );
}
