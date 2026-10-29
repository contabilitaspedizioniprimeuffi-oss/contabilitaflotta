import { ChevronRight, Plus, Search, User } from "lucide-react";
import Link from "next/link";
import Plate from "@/components/plate";
import { DueChip, PageHeader, Pill, STATO_TONE, Empty } from "@/components/ui";
import { consumptionByVehicle, listDeadlines, listRefuels, listVehicles } from "@/lib/data";
import {
  daysUntil,
  fmtEur,
  fmtNum,
  ACQ_LABEL,
  CARB_LABEL,
  CATEGORIA_LABEL,
  SCADENZA_LABEL,
  STATO_LABEL,
} from "@/lib/format";
import { Truck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MezziPage(props: {
  searchParams: Promise<{ q?: string; stato?: string; acq?: string }>;
}) {
  const { q = "", stato = "", acq = "" } = await props.searchParams;

  const [vs, refs, dls] = await Promise.all([listVehicles(), listRefuels(), listDeadlines()]);
  const consMap = consumptionByVehicle(refs);

  // prossima scadenza per mezzo (più vicina nel tempo, incluse scadute)
  const nextDl = new Map<number, { tipo: string; scadenza: string; days: number }>();
  for (const d of dls) {
    const days = daysUntil(d.scadenza);
    const cur = nextDl.get(d.vehicleId);
    if (!cur || days < cur.days) nextDl.set(d.vehicleId, { tipo: d.tipo, scadenza: d.scadenza, days });
  }

  const ql = q.trim().toLowerCase();
  const filtered = vs.filter((v) => {
    if (stato && v.stato !== stato) return false;
    if (acq && v.tipoAcquisizione !== acq) return false;
    if (ql) {
      const hay = `${v.targa} ${v.marca} ${v.modello} ${v.conducente ?? ""}`.toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Parco veicoli"
        title="Mezzi"
        sub="Anagrafica completa di ogni automezzo: acquisizione, km, consumi, conducente e scadenze."
        actions={
          <Link href="/mezzi/nuovo" className="btn-primary">
            <Plus className="h-4 w-4" strokeWidth={2.6} /> Nuovo mezzo
          </Link>
        }
      />

      {/* Filtri */}
      <form method="GET" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-56 flex-1">
          <label className="label">Cerca</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
            <input
              className="input pl-10!"
              name="q"
              defaultValue={q}
              placeholder="Targa, modello o conducente…"
            />
          </div>
        </div>
        <div className="w-44">
          <label className="label">Stato</label>
          <select className="input" name="stato" defaultValue={stato}>
            <option value="">Tutti</option>
            <option value="attivo">Attivo</option>
            <option value="in_manutenzione">In manutenzione</option>
            <option value="fermo">Fermo</option>
            <option value="venduto">Venduto</option>
          </select>
        </div>
        <div className="w-44">
          <label className="label">Acquisizione</label>
          <select className="input" name="acq" defaultValue={acq}>
            <option value="">Tutte</option>
            <option value="acquisto">Acquisto</option>
            <option value="noleggio">Noleggio</option>
          </select>
        </div>
        <button type="submit" className="btn-dark h-11!">
          Filtra
        </button>
        <span className="ml-auto hidden pb-3 font-mono text-xs font-semibold text-mute sm:block">
          {filtered.length} mezzi
        </span>
      </form>

      {filtered.length === 0 ? (
        <Empty
          icon={Truck}
          title="Nessun mezzo trovato"
          sub="Prova a modificare i filtri oppure registra un nuovo automezzo."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((v) => {
            const cons = consMap.get(v.id);
            const nd = nextDl.get(v.id);
            return (
              <Link
                key={v.id}
                href={`/mezzi/${v.id}`}
                className="card group flex flex-col p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(20,22,19,0.06),0_18px_40px_-18px_rgba(20,22,19,0.28)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <Plate targa={v.targa} />
                  <Pill tone={STATO_TONE[v.stato] ?? "soft"}>{STATO_LABEL[v.stato] ?? v.stato}</Pill>
                </div>

                <div className="mt-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">
                    {v.marca} · {v.annoImmatricolazione ?? "—"}
                  </p>
                  <h3 className="mt-0.5 font-display text-xl font-black tracking-tight group-hover:underline">
                    {v.modello}
                  </h3>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-mute">
                    <User className="h-3.5 w-3.5" />
                    {v.conducente ?? "Non assegnato"}
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-dashed border-line pt-4">
                  <div>
                    <p className="eyebrow text-[9px]!">Km</p>
                    <p className="mt-1 font-mono text-sm font-bold">{fmtNum(v.kmAttuali)}</p>
                  </div>
                  <div>
                    <p className="eyebrow text-[9px]!">Consumo</p>
                    <p className="mt-1 font-mono text-sm font-bold">
                      {cons?.kmPerLiter ? `${cons.kmPerLiter.toFixed(1)} km/l` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="eyebrow text-[9px]!">
                      {v.tipoAcquisizione === "noleggio" ? "Canone/mese" : "Valore"}
                    </p>
                    <p className="mt-1 font-mono text-sm font-bold">
                      {v.tipoAcquisizione === "noleggio"
                        ? fmtEur(v.canoneMensile)
                        : fmtEur(v.prezzoAcquisto)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Pill tone={v.tipoAcquisizione === "noleggio" ? "sky" : "soft"}>
                      {ACQ_LABEL[v.tipoAcquisizione]}
                    </Pill>
                    <span className="truncate text-xs text-mute">
                      {CATEGORIA_LABEL[v.categoria] ?? v.categoria} · {CARB_LABEL[v.carburante] ?? v.carburante}
                    </span>
                  </div>
                  {nd ? <DueChip days={nd.days} /> : null}
                </div>

                <div className="mt-4 flex items-center justify-end gap-1 border-t border-line pt-3 text-xs font-bold text-mute transition-colors group-hover:text-ink-950">
                  Apri scheda
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
