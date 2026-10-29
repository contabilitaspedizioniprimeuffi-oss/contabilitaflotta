import {
  Banknote,
  CalendarClock,
  ChevronRight,
  CircleDot,
  Disc,
  Fuel,
  Gauge,
  Hammer,
  Plus,
  ShieldCheck,
  Siren,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { MonthlyBars, HBar } from "@/components/charts";
import Plate from "@/components/plate";
import SyncButton from "@/components/sync-button";
import { DueChip, PageHeader, Pill, SectionCard, STATO_TONE, StatCard } from "@/components/ui";
import {
  computeConsumption,
  consumptionByVehicle,
  listDeadlinesJoin,
  listFinesJoin,
  listRecentMaintenances,
  listRefuels,
  listVehicles,
} from "@/lib/data";
import {
  fmtEur,
  fmtKm,
  fmtNum,
  fmtDate,
  daysUntil,
  lastNMonthKeys,
  monthKey,
  monthLabel,
  currentMonthKey,
  ACQ_LABEL,
  MANUT_LABEL,
  SCADENZA_LABEL,
  STATO_LABEL,
} from "@/lib/format";

export const dynamic = "force-dynamic";

const MANUT_ICON: Record<string, LucideIcon> = {
  tagliando: Wrench,
  gomme: CircleDot,
  freni: Disc,
  riparazione: Hammer,
  revisione: ShieldCheck,
  altro: Wrench,
};

export default async function Dashboard() {
  const [vs, refs, recentMans, dls, allFines] = await Promise.all([
    listVehicles(),
    listRefuels(),
    listRecentMaintenances(6),
    listDeadlinesJoin(),
    listFinesJoin(null, null),
  ]);

  const attivi = vs.filter((v) => v.stato === "attivo").length;
  const inManutenzione = vs.filter((v) => v.stato === "in_manutenzione").length;
  const kmTotali = vs.reduce((s, v) => s + v.kmAttuali, 0);

  // --- carburante: mese corrente e serie 6 mesi
  const cur = currentMonthKey();
  const monthFuel = refs.filter((r) => monthKey(r.data) === cur);
  const spesaFuelMese = monthFuel.reduce((s, r) => s + Number(r.costo), 0);
  const litriMese = monthFuel.reduce((s, r) => s + Number(r.litri), 0);

  const keys = lastNMonthKeys(6);
  const fuelSeries = keys.map((k) => ({
    key: k,
    label: monthLabel(k),
    value: refs.filter((r) => monthKey(r.data) === k).reduce((s, r) => s + Number(r.costo), 0),
    current: k === cur,
  }));

  // --- km percorsi nel mese (differenza tra rifornimenti consecutivi)
  let kmMese = 0;
  const byVehicle = new Map<number, typeof refs>();
  for (const r of refs) {
    const arr = byVehicle.get(r.vehicleId) ?? [];
    arr.push(r);
    byVehicle.set(r.vehicleId, arr);
  }
  for (const arr of byVehicle.values()) {
    for (let i = 1; i < arr.length; i++) {
      if (monthKey(arr[i].data) === cur && arr[i].km > arr[i - 1].km) {
        kmMese += arr[i].km - arr[i - 1].km;
      }
    }
  }

  // --- scadenze
  const dlsWithDays = dls
    .filter((x) => x.stato !== "venduto")
    .map((x) => ({ ...x, days: daysUntil(x.d.scadenza) }))
    .sort((a, b) => a.days - b.days);
  const critiche = dlsWithDays.filter((d) => d.days <= 30);
  const prossima = dlsWithDays.find((d) => d.days >= 0);

  // --- manutenzioni mese
  const spesaManutMese = recentMans
    .concat() // la query è già limitata; per il totale mese usiamo solo quelli del mese
    .filter((x) => monthKey(x.m.data) === cur)
    .reduce((s, x) => s + Number(x.m.costo ?? 0), 0);

  const canoniMensili = vs
    .filter((v) => v.tipoAcquisizione === "noleggio" && v.stato !== "venduto" && v.canoneMensile)
    .reduce((s, v) => s + Number(v.canoneMensile), 0);

  // --- multe
  const multeDaPagare = allFines.filter((x) => x.f.stato === "da_pagare");
  const importoMulteDaPagare = multeDaPagare.reduce((s, x) => s + Number(x.f.importo), 0);
  const multeMese = allFines
    .filter((x) => monthKey(x.f.data) === cur)
    .reduce((s, x) => s + Number(x.f.importo), 0);
  const piuVecchia = multeDaPagare[multeDaPagare.length - 1];

  const totaleMese = spesaFuelMese + spesaManutMese + canoniMensili;

  // --- consumi per mezzo
  const consMap = consumptionByVehicle(refs);
  const topConsumi = vs
    .filter((v) => v.stato !== "venduto")
    .map((v) => ({ v, cons: consMap.get(v.id) ?? computeConsumption([]) }))
    .filter((x) => x.cons.kmPerLiter !== null)
    .sort((a, b) => (b.cons.kmPerLiter ?? 0) - (a.cons.kmPerLiter ?? 0))
    .slice(0, 6);
  const maxKml = Math.max(1, ...topConsumi.map((x) => x.cons.kmPerLiter ?? 0));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Controllo flotta"
        title="Panoramica"
        sub="Stato del parco mezzi, costi del mese, consumi e scadenze in un colpo d'occhio."
        actions={
          <Link href="/mezzi/nuovo" className="btn-primary">
            <Plus className="h-4 w-4" strokeWidth={2.6} /> Nuovo mezzo
          </Link>
        }
      />

      {/* Sincronizzazione Google Fogli */}
      <SyncButton variant="banner" />

      {/* KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Truck}
          label="Mezzi attivi"
          value={`${attivi} / ${vs.length}`}
          sub={`${inManutenzione} in manutenzione`}
        />
        <StatCard
          icon={Gauge}
          label="Km totali flotta"
          value={fmtNum(kmTotali)}
          sub={`+${fmtNum(kmMese)} km questo mese`}
        />
        <StatCard
          icon={Fuel}
          label="Carburante · mese"
          value={fmtEur(spesaFuelMese)}
          sub={`${fmtNum(Math.round(litriMese))} litri riforniti`}
        />
        <StatCard
          icon={CalendarClock}
          label="Scadenze ≤ 30 g"
          value={String(critiche.length)}
          tone={critiche.length > 0 ? "red" : "ink"}
          sub={
            prossima
              ? `Più vicina: ${prossima.targa} · ${fmtDate(prossima.d.scadenza)}`
              : "Nessuna scadenza in vista"
          }
        />
      </div>

      {/* Alert multe non pagate */}
      {multeDaPagare.length > 0 ? (
        <Link
          href="/multe"
          className="card group flex items-center gap-4 border-danger/30 bg-danger/[0.07] p-4 transition-colors hover:bg-danger/[0.12]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-danger text-white">
            <Siren className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-extrabold uppercase tracking-wide text-danger">
              {multeDaPagare.length} {multeDaPagare.length === 1 ? "multa in attesa" : "multe in attesa"} di pagamento
            </p>
            <p className="text-xs text-ink-800/70">
              Totale {fmtEur(importoMulteDaPagare)}
              {piuVecchia
                ? ` · la più vecchia: ${piuVecchia.targa} del ${fmtDate(piuVecchia.f.data)}`
                : ""}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-danger transition-transform group-hover:translate-x-1" />
        </Link>
      ) : null}

      {/* Grafico + costi mensili */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard title="Spesa carburante · ultimi 6 mesi" className="xl:col-span-2">
          <MonthlyBars
            data={fuelSeries.map((f) => ({ label: f.label, value: f.value, current: f.current }))}
          />
        </SectionCard>

        <SectionCard title="Costi del mese">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-mute">
                <Banknote className="h-4 w-4" /> Canoni noleggio
              </span>
              <span className="font-mono text-sm font-bold">{fmtEur(canoniMensili)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-mute">
                <Fuel className="h-4 w-4" /> Carburante
              </span>
              <span className="font-mono text-sm font-bold">{fmtEur(spesaFuelMese)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-mute">
                <Wrench className="h-4 w-4" /> Manutenzioni
              </span>
              <span className="font-mono text-sm font-bold">{fmtEur(spesaManutMese)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-mute">
                <Siren className="h-4 w-4" /> Multe ricevute
              </span>
              <span className="font-mono text-sm font-bold">{fmtEur(multeMese)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-dashed border-line pt-3.5">
              <span className="text-sm font-bold uppercase tracking-wide">Totale uscite</span>
              <span className="font-display text-xl font-black tracking-tight">
                {fmtEur(totaleMese)}
              </span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Scadenze, manutenzioni, consumi */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <SectionCard
          title="Scadenze imminenti"
          action={
            <Link href="/scadenze" className="group flex items-center gap-1 text-xs font-bold text-mute transition-colors hover:text-ink-950">
              Tutte <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          }
          pad={false}
        >
          <div className="divide-y divide-line">
            {dlsWithDays.slice(0, 5).map((x) => (
              <Link
                key={x.d.id}
                href={`/mezzi/${x.d.vehicleId}`}
                className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-paper/60"
              >
                <Plate targa={x.targa} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {SCADENZA_LABEL[x.d.tipo] ?? x.d.tipo}
                  </p>
                  <p className="text-xs text-mute">{fmtDate(x.d.scadenza)}</p>
                </div>
                <DueChip days={x.days} />
              </Link>
            ))}
            {dlsWithDays.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-mute">Nessuna scadenza registrata.</p>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title="Ultime manutenzioni"
          action={
            <Link href="/manutenzioni" className="group flex items-center gap-1 text-xs font-bold text-mute transition-colors hover:text-ink-950">
              Tutte <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          }
          pad={false}
        >
          <div className="divide-y divide-line">
            {recentMans.map((x) => {
              const Icon = MANUT_ICON[x.m.tipo] ?? Wrench;
              return (
                <Link
                  key={x.m.id}
                  href={`/mezzi/${x.m.vehicleId}`}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-paper/60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-950/[0.05] text-ink-800">
                    <Icon className="h-4 w-4" strokeWidth={2.1} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {MANUT_LABEL[x.m.tipo] ?? x.m.tipo} · {x.targa}
                    </p>
                    <p className="truncate text-xs text-mute">
                      {fmtDate(x.m.data)}
                      {x.m.officina ? ` · ${x.m.officina}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-bold">
                    {fmtEur(x.m.costo)}
                  </span>
                </Link>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Consumo medio per mezzo" className="lg:col-span-2 xl:col-span-1">
          <div className="space-y-4">
            {topConsumi.map(({ v, cons }) => (
              <HBar
                key={v.id}
                label={`${v.targa} · ${v.modello}`}
                valueText={`${cons.kmPerLiter!.toFixed(1)} km/l`}
                pct={(cons.kmPerLiter ?? 0) / maxKml}
                sub={`${fmtNum(cons.distanzaCoperta)} km rilevati · ${fmtEur(cons.eurPerKm, 3)}/km`}
              />
            ))}
            {topConsumi.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">
                Registra almeno due rifornimenti per calcolare i consumi.
              </p>
            ) : null}
          </div>
        </SectionCard>
      </div>

      {/* Stato flotta */}
      <SectionCard title="Stato della flotta" pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-line">
                <th className="th">Mezzo</th>
                <th className="th">Acquisizione</th>
                <th className="th">Conducente</th>
                <th className="th text-right">Km</th>
                <th className="th text-right">Consumo</th>
                <th className="th">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {vs.map((v) => {
                const cons = consMap.get(v.id);
                return (
                  <tr key={v.id} className="group transition-colors hover:bg-paper/60">
                    <td className="td">
                      <Link href={`/mezzi/${v.id}`} className="flex items-center gap-3">
                        <Plate targa={v.targa} size="sm" />
                        <span className="font-bold group-hover:underline">
                          {v.marca} {v.modello}
                        </span>
                      </Link>
                    </td>
                    <td className="td">
                      <Pill tone={v.tipoAcquisizione === "noleggio" ? "sky" : "soft"}>
                        {ACQ_LABEL[v.tipoAcquisizione] ?? v.tipoAcquisizione}
                      </Pill>
                    </td>
                    <td className="td text-mute">{v.conducente ?? "—"}</td>
                    <td className="td text-right font-mono text-xs font-semibold">
                      {fmtNum(v.kmAttuali)}
                    </td>
                    <td className="td text-right font-mono text-xs font-semibold">
                      {cons?.kmPerLiter ? `${cons.kmPerLiter.toFixed(1)} km/l` : "—"}
                    </td>
                    <td className="td">
                      <Pill tone={STATO_TONE[v.stato] ?? "soft"}>{STATO_LABEL[v.stato] ?? v.stato}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <p className="pb-4 text-center text-[11px] uppercase tracking-[0.18em] text-mute/70">
        Flotta OS · strumento interno · dati aggiornati in tempo reale · {fmtKm(kmTotali)}
      </p>
    </div>
  );
}
