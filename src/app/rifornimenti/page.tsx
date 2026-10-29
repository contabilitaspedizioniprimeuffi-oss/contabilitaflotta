import { ChevronRight, Fuel } from "lucide-react";
import Link from "next/link";
import Plate from "@/components/plate";
import { Empty, PageHeader, StatCard } from "@/components/ui";
import { listRefuelsJoin, listVehicles } from "@/lib/data";
import { currentMonthKey, fmtDate, fmtEur, fmtNum, monthKey } from "@/lib/format";
import { Banknote, Droplets, Gauge } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RifornimentiPage(props: {
  searchParams: Promise<{ mezzo?: string }>;
}) {
  const { mezzo = "" } = await props.searchParams;
  const vid = mezzo ? Number(mezzo) : null;

  const [rows, vs] = await Promise.all([listRefuelsJoin(vid), listVehicles()]);

  const cur = currentMonthKey();
  const monthRows = rows.filter((x) => monthKey(x.r.data) === cur);
  const spesaMese = monthRows.reduce((s, x) => s + Number(x.r.costo), 0);
  const litriMese = monthRows.reduce((s, x) => s + Number(x.r.litri), 0);
  const prezzoMedio = litriMese > 0 ? spesaMese / litriMese : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Carburante"
        title="Rifornimenti"
        sub="Ogni pieno registrato aggiorna chilometri, consumo medio e costo al km del mezzo."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Banknote} label="Spesa · mese" value={fmtEur(spesaMese)} sub={`${monthRows.length} rifornimenti`} />
        <StatCard icon={Droplets} label="Litri · mese" value={fmtNum(Math.round(litriMese))} tone="volt" sub="somma dei pieni registrati" />
        <StatCard icon={Gauge} label="Prezzo medio" value={`${prezzoMedio.toFixed(3)} €/l`} sub="mese corrente, flotta filtrata" />
      </div>

      <form method="GET" className="card flex flex-wrap items-center gap-3 p-4">
        <Fuel className="h-4 w-4 text-mute" />
        <select className="input w-72!" name="mezzo" defaultValue={mezzo}>
          <option value="">Tutti i mezzi</option>
          {vs.map((v) => (
            <option key={v.id} value={v.id}>
              {v.targa} — {v.marca} {v.modello}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-dark h-11!">
          Applica
        </button>
        <span className="ml-auto font-mono text-xs font-semibold text-mute">
          {rows.length} rifornimenti
        </span>
      </form>

      {rows.length === 0 ? (
        <Empty icon={Fuel} title="Nessun rifornimento" sub="Registra i pieni dalla scheda del mezzo." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="th">Data</th>
                  <th className="th">Mezzo</th>
                  <th className="th text-right">Km</th>
                  <th className="th text-right">Litri</th>
                  <th className="th text-right">€/litro</th>
                  <th className="th text-right">Totale</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((x) => (
                  <tr key={x.r.id} className="transition-colors hover:bg-paper/60">
                    <td className="td font-semibold whitespace-nowrap">{fmtDate(x.r.data)}</td>
                    <td className="td">
                      <Link href={`/mezzi/${x.r.vehicleId}`} className="flex items-center gap-2.5 font-bold hover:underline">
                        <Plate targa={x.targa} size="sm" />
                        <span className="hidden 2xl:inline">
                          {x.marca} {x.modello}
                        </span>
                      </Link>
                    </td>
                    <td className="td text-right font-mono text-xs font-semibold">{fmtNum(x.r.km)}</td>
                    <td className="td text-right font-mono text-xs">{Number(x.r.litri).toFixed(1)}</td>
                    <td className="td text-right font-mono text-xs">
                      {(Number(x.r.costo) / Number(x.r.litri)).toFixed(3)} €
                    </td>
                    <td className="td text-right font-mono text-sm font-bold">{fmtEur(x.r.costo, 2)}</td>
                    <td className="td text-right">
                      <Link
                        href={`/mezzi/${x.r.vehicleId}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-mute transition-colors hover:bg-ink-950/5 hover:text-ink-950"
                        aria-label="Apri scheda mezzo"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
