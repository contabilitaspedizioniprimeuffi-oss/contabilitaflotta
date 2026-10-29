import { ChevronRight, Filter, Wrench } from "lucide-react";
import Link from "next/link";
import Plate from "@/components/plate";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { listMaintenancesByType } from "@/lib/data";
import { fmtDate, fmtEur, fmtNum, MANUT_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

const TONES: Record<string, "soft" | "amber" | "red" | "sky" | "gray" | "volt"> = {
  tagliando: "volt",
  gomme: "sky",
  freni: "amber",
  riparazione: "red",
  revisione: "gray",
  altro: "soft",
};

export default async function ManutenzioniPage(props: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo = "" } = await props.searchParams;
  const rows = await listMaintenancesByType(tipo || null);

  const totale = rows.reduce((s, x) => s + Number(x.m.costo ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Officina"
        title="Manutenzioni"
        sub="Registro completo di tagliandi, gomme, freni e riparazioni di tutta la flotta."
      />

      <form method="GET" className="card flex flex-wrap items-center gap-3 p-4">
        <Filter className="h-4 w-4 text-mute" />
        <select className="input w-56!" name="tipo" defaultValue={tipo}>
          <option value="">Tutti i tipi</option>
          <option value="tagliando">Tagliando</option>
          <option value="gomme">Gomme</option>
          <option value="freni">Freni</option>
          <option value="riparazione">Riparazione</option>
          <option value="revisione">Revisione</option>
          <option value="altro">Altro</option>
        </select>
        <button type="submit" className="btn-dark h-11!">
          Applica
        </button>
        <span className="ml-auto font-mono text-xs font-semibold text-mute">
          {rows.length} interventi · {fmtEur(totale)} totali
        </span>
      </form>

      {rows.length === 0 ? (
        <Empty icon={Wrench} title="Nessun intervento trovato" sub="Cambia filtro o registra una manutenzione dalla scheda mezzo." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="th">Data</th>
                  <th className="th">Mezzo</th>
                  <th className="th">Tipo</th>
                  <th className="th">Descrizione</th>
                  <th className="th">Officina</th>
                  <th className="th text-right">Km</th>
                  <th className="th text-right">Costo</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((x) => (
                  <tr key={x.m.id} className="group transition-colors hover:bg-paper/60">
                    <td className="td font-semibold whitespace-nowrap">{fmtDate(x.m.data)}</td>
                    <td className="td">
                      <Link href={`/mezzi/${x.m.vehicleId}`} className="flex items-center gap-2.5 font-bold hover:underline">
                        <Plate targa={x.targa} size="sm" />
                        <span className="hidden 2xl:inline">
                          {x.marca} {x.modello}
                        </span>
                      </Link>
                    </td>
                    <td className="td">
                      <Pill tone={TONES[x.m.tipo] ?? "soft"}>{MANUT_LABEL[x.m.tipo] ?? x.m.tipo}</Pill>
                    </td>
                    <td className="td max-w-64">
                      <p className="line-clamp-1 text-mute">{x.m.descrizione ?? "—"}</p>
                      {x.m.prossimoKm ? (
                        <p className="text-[11px] font-semibold text-sky">
                          prossimo a {fmtNum(x.m.prossimoKm)} km
                        </p>
                      ) : null}
                    </td>
                    <td className="td text-mute">{x.m.officina ?? "—"}</td>
                    <td className="td text-right font-mono text-xs font-semibold whitespace-nowrap">
                      {x.m.km !== null ? fmtNum(x.m.km) : "—"}
                    </td>
                    <td className="td text-right font-mono text-sm font-bold whitespace-nowrap">
                      {fmtEur(x.m.costo)}
                    </td>
                    <td className="td text-right">
                      <Link
                        href={`/mezzi/${x.m.vehicleId}`}
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
