import { Banknote, ChevronRight, Filter, Route, TrendingUp } from "lucide-react";
import Link from "next/link";
import { AddTollDialog, DeleteTollButton, EditTollButton } from "@/components/dialogs";
import Plate from "@/components/plate";
import { Empty, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { listTollMonths, listTollsJoin, listVehicles } from "@/lib/data";
import { currentMonthKey, fmtDate, fmtEur, fmtMese, fmtMeseTitolo, fmtNum, fmtTratta } from "@/lib/format";

export const dynamic = "force-dynamic";

type TotaleMezzo = {
  vehicleId: number;
  targa: string;
  marca: string;
  modello: string;
  totale: number;
  passaggi: number;
};

export default async function PedaggiPage(props: {
  searchParams: Promise<{ mezzo?: string; mese?: string }>;
}) {
  const { mezzo = "", mese: meseScelto } = await props.searchParams;
  const vid = mezzo ? Number(mezzo) : null;

  // Senza scelta si guarda il mese corrente; "tutti" = tutti i mesi
  const meseCorrente = currentMonthKey();
  const mese =
    meseScelto === "tutti"
      ? null
      : meseScelto && /^\d{4}-\d{2}$/.test(meseScelto)
        ? meseScelto
        : meseCorrente;

  const [rows, vs, mesiConPedaggi] = await Promise.all([
    listTollsJoin(vid, mese),
    listVehicles(),
    listTollMonths(),
  ]);
  const opzioniMese = Array.from(new Set([meseCorrente, ...mesiConPedaggi, ...(mese ? [mese] : [])]))
    .sort()
    .reverse();

  const periodo = mese ? fmtMese(mese) : "tutti i mesi";
  const totale = rows.reduce((s, x) => s + Number(x.p.importo), 0);
  const mezzoScelto = vid ? vs.find((v) => v.id === vid) : undefined;

  // Totale per targa nel periodo scelto
  const perMezzo = new Map<number, TotaleMezzo>();
  for (const x of rows) {
    const t = perMezzo.get(x.p.vehicleId) ?? {
      vehicleId: x.p.vehicleId,
      targa: x.targa,
      marca: x.marca,
      modello: x.modello,
      totale: 0,
      passaggi: 0,
    };
    t.totale += Number(x.p.importo);
    t.passaggi += 1;
    perMezzo.set(x.p.vehicleId, t);
  }
  const perTarga = [...perMezzo.values()].sort((a, b) => b.totale - a.totale);
  const piuCaro = rows.reduce<(typeof rows)[number] | null>(
    (max, x) => (!max || Number(x.p.importo) > Number(max.p.importo) ? x : max),
    null
  );

  const mezziSelezionabili = vs
    .filter((v) => v.stato !== "venduto")
    .map((v) => ({ id: v.id, targa: v.targa, marca: v.marca, modello: v.modello }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Autostrade"
        title="Pedaggi"
        sub="Caselli e importi dei pedaggi di ogni mezzo, con il totale del mese diviso per targa."
        actions={
          vs.length > 0 ? (
            <AddTollDialog vehicles={mezziSelezionabili} mezzoProposto={vid ?? undefined} principale />
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={Banknote}
          label={`Spesa · ${periodo}`}
          value={fmtEur(totale, 2)}
          sub={mezzoScelto ? `solo ${mezzoScelto.targa}` : "tutta la flotta"}
        />
        <StatCard
          icon={Route}
          label="Passaggi"
          value={fmtNum(rows.length)}
          tone="volt"
          sub={rows.length > 0 ? `in media ${fmtEur(totale / rows.length, 2)} a passaggio` : "nessun pedaggio registrato"}
        />
        {vid ? (
          <StatCard
            icon={TrendingUp}
            label="Pedaggio più caro"
            value={piuCaro ? fmtEur(piuCaro.p.importo, 2) : "—"}
            sub={piuCaro ? `${fmtTratta(piuCaro.p.entrata, piuCaro.p.uscita)} · ${fmtDate(piuCaro.p.data)}` : "—"}
          />
        ) : (
          <StatCard
            icon={TrendingUp}
            label="Mezzo che spende di più"
            value={perTarga[0]?.targa ?? "—"}
            sub={
              perTarga[0]
                ? `${fmtEur(perTarga[0].totale, 2)} · ${perTarga[0].passaggi} ${perTarga[0].passaggi === 1 ? "passaggio" : "passaggi"}`
                : "—"
            }
          />
        )}
      </div>

      {/* key: dopo un clic su una targa (navigazione senza ricaricare) i filtri mostrano la scelta giusta */}
      <form key={`${mezzo}|${mese ?? "tutti"}`} method="GET" className="card flex flex-wrap items-center gap-3 p-4">
        <Filter className="h-4 w-4 text-mute" />
        <select className="input w-72!" name="mezzo" defaultValue={mezzo}>
          <option value="">Tutti i mezzi</option>
          {vs.map((v) => (
            <option key={v.id} value={v.id}>
              {v.targa} — {v.marca} {v.modello}
            </option>
          ))}
        </select>
        <select className="input w-52!" name="mese" defaultValue={mese ?? "tutti"}>
          {opzioniMese.map((k) => (
            <option key={k} value={k}>
              {fmtMeseTitolo(k)}
            </option>
          ))}
          <option value="tutti">Tutti i mesi</option>
        </select>
        <button type="submit" className="btn-dark h-11!">
          Applica
        </button>
        <span className="ml-auto font-mono text-xs font-semibold text-mute">
          {rows.length} pedaggi
        </span>
      </form>

      {!vid && perTarga.length > 0 ? (
        <SectionCard title={`Totale per targa · ${periodo}`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {perTarga.map((t) => (
              <Link
                key={t.vehicleId}
                href={`/pedaggi?mezzo=${t.vehicleId}&mese=${mese ?? "tutti"}`}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 transition-colors hover:border-ink-900/30 hover:bg-paper"
                title={`Mostra solo i pedaggi di ${t.targa}`}
              >
                <span className="min-w-0">
                  <Plate targa={t.targa} size="sm" />
                  <span className="mt-1.5 block truncate text-xs text-mute">
                    {t.marca} {t.modello} · {t.passaggi} {t.passaggi === 1 ? "passaggio" : "passaggi"}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-sm font-bold">{fmtEur(t.totale, 2)}</span>
              </Link>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {rows.length === 0 ? (
        <Empty
          icon={Route}
          title={`Nessun pedaggio · ${periodo}`}
          sub={
            vs.length === 0
              ? "Registra prima un mezzo dalla sezione Mezzi."
              : "Registra un pedaggio con «Nuovo pedaggio» o dalla scheda del mezzo, oppure scegli un altro mese."
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="th">Data</th>
                  <th className="th">Mezzo</th>
                  <th className="th">Tratta</th>
                  <th className="th">Note</th>
                  <th className="th text-right">Importo</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((x) => (
                  <tr key={x.p.id} className="transition-colors hover:bg-paper/60">
                    <td className="td whitespace-nowrap font-semibold">{fmtDate(x.p.data)}</td>
                    <td className="td">
                      <Link href={`/mezzi/${x.p.vehicleId}`} className="flex items-center gap-2.5 font-bold hover:underline">
                        <Plate targa={x.targa} size="sm" />
                        <span className="hidden 2xl:inline">
                          {x.marca} {x.modello}
                        </span>
                      </Link>
                    </td>
                    <td className="td font-semibold">{fmtTratta(x.p.entrata, x.p.uscita)}</td>
                    <td className="td max-w-[260px] truncate text-xs text-mute">{x.p.note ?? "—"}</td>
                    <td className="td text-right font-mono text-sm font-bold">{fmtEur(x.p.importo, 2)}</td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-1">
                        <EditTollButton initial={x.p} />
                        <DeleteTollButton id={x.p.id} />
                        <Link
                          href={`/mezzi/${x.p.vehicleId}`}
                          className="hidden h-8 w-8 items-center justify-center rounded-full text-mute transition-colors hover:bg-ink-950/5 hover:text-ink-950 md:flex"
                          aria-label="Apri scheda mezzo"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line bg-paper/60">
                  <td className="td text-xs font-bold uppercase tracking-wide" colSpan={4}>
                    Totale · {periodo}
                    {mezzoScelto ? ` · ${mezzoScelto.targa}` : ""}
                  </td>
                  <td className="td text-right font-mono text-sm font-black">{fmtEur(totale, 2)}</td>
                  <td className="td" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
