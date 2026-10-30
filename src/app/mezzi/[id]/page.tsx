import {
  ArrowLeft,
  Banknote,
  Building2,
  CalendarClock,
  CalendarDays,
  CircleDollarSign,
  CircleDot,
  Disc,
  Fuel,
  Gauge,
  Hammer,
  NotebookText,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Siren,
  User,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AddDeadlineDialog,
  AddDriverLogDialog,
  AddFineDialog,
  AddMaintenanceDialog,
  AddRefuelDialog,
  DeleteButton,
  DeleteDriverLogButton,
  DeleteFineButton,
  EditDeadlineButton,
  EditFineButton,
  EditMaintenanceButton,
  EditRefuelButton,
  FinePaidToggle,
} from "@/components/dialogs";
import Plate from "@/components/plate";
import {
  DueChip,
  Empty,
  Pill,
  Progress,
  SectionCard,
  STATO_TONE,
  StatCard,
} from "@/components/ui";
import VTabs, { type Pane } from "@/components/vtabs";
import type { Maintenance, Refuel, Vehicle } from "@/db/schema";
import {
  deleteDeadline,
  deleteMaintenance,
  deleteRefuel,
  deleteVehicle,
} from "@/lib/actions";
import { computeConsumption, getVehicleBundle, nextServiceInfo } from "@/lib/data";
import {
  DAY_MS,
  fmtDate,
  fmtDateLong,
  fmtEur,
  fmtMese,
  fmtNum,
  daysUntil,
  ACQ_LABEL,
  CARB_LABEL,
  CATEGORIA_LABEL,
  MANUT_LABEL,
  MULTA_STATO_LABEL,
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

const MULTA_TONE: Record<string, "red" | "volt" | "amber"> = {
  da_pagare: "red",
  pagata: "volt",
  contestata: "amber",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-mute">{label}</span>
      <span className="text-right text-sm font-semibold">{children}</span>
    </div>
  );
}

function DateBlock({ iso }: { iso: string }) {
  return (
    <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-paper font-mono">
      <span className="text-sm font-black leading-none">{iso.slice(8, 10)}</span>
      <span className="text-[9px] font-bold uppercase text-mute">
        {new Intl.DateTimeFormat("it-IT", { month: "short" }).format(new Date(`${iso}T00:00:00`))}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Km massimi del contratto (noleggio / leasing)
// ---------------------------------------------------------------------------
const GIORNI_MESE = 30.44;

type KmContratto = {
  massimi: number;
  attuali: number;
  /** negativo = limite superato */
  rimanenti: number;
  pct: number;
  /** media km/mese ancora disponibile fino a fine contratto */
  kmMeseDisponibili: number | null;
  /** km/mese percorsi di recente (dai rifornimenti degli ultimi 4 mesi) */
  ritmoMese: number | null;
  /** km stimati a fine contratto mantenendo il ritmo recente */
  stimaFine: number | null;
};

function ritmoKmMensile(refs: Refuel[]): number | null {
  const limite = new Date(Date.now() - 120 * DAY_MS).toISOString().slice(0, 10);
  const recenti = refs
    .filter((r) => r.data >= limite && r.km > 0)
    .sort((a, b) => a.data.localeCompare(b.data));
  if (recenti.length < 2) return null;
  const primo = recenti[0];
  const ultimo = recenti[recenti.length - 1];
  const giorni =
    (new Date(`${ultimo.data}T00:00:00`).getTime() - new Date(`${primo.data}T00:00:00`).getTime()) / DAY_MS;
  const km = ultimo.km - primo.km;
  if (giorni < 20 || km <= 0) return null;
  const ritmo = (km / giorni) * GIORNI_MESE;
  return ritmo > 25000 ? null : ritmo; // valori impossibili = km scritti male nel registro
}

function calcolaKmContratto(v: Vehicle, refs: Refuel[], giorniAllaFine: number | null): KmContratto | null {
  const massimi = v.kmMassimiContratto;
  if (!massimi || massimi <= 0) return null;
  const attuali = v.kmAttuali;
  const rimanenti = massimi - attuali;
  const mesiRimanenti = giorniAllaFine !== null && giorniAllaFine > 0 ? giorniAllaFine / GIORNI_MESE : null;
  const ritmoMese = ritmoKmMensile(refs);
  return {
    massimi,
    attuali,
    rimanenti,
    pct: attuali / massimi,
    kmMeseDisponibili: mesiRimanenti !== null && rimanenti > 0 ? rimanenti / Math.max(1, mesiRimanenti) : null,
    ritmoMese,
    stimaFine: mesiRimanenti !== null && ritmoMese !== null ? Math.round(attuali + ritmoMese * mesiRimanenti) : null,
  };
}

export default async function SchedaMezzo(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const vid = Number(id);
  if (!Number.isFinite(vid)) notFound();

  const bundle = await getVehicleBundle(vid);
  if (!bundle) notFound();
  const { vehicle: v, maintenances: mans, refuels: refs, deadlines: dls, fines: fns, driverLogs: logs } = bundle;

  const cons = computeConsumption(refs);
  const service = nextServiceInfo(mans, v.kmAttuali);

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const spesa30 =
    refs.filter((r) => r.data >= cutoff).reduce((s, r) => s + Number(r.costo), 0) +
    mans.filter((m) => m.data >= cutoff).reduce((s, m) => s + Number(m.costo ?? 0), 0);

  const spesaManutTot = mans.reduce((s, m) => s + Number(m.costo ?? 0), 0);

  const multeDaPagare = fns.filter((f) => f.stato === "da_pagare");
  const importoDaPagare = multeDaPagare.reduce((s, f) => s + Number(f.importo), 0);
  const puntiTotali = fns.reduce((s, f) => s + (f.punti ?? 0), 0);

  // Scadenza del contratto (noleggio e leasing): i giorni mancanti bastano la data di fine,
  // per la barra di avanzamento serve anche la data di inizio.
  const conContratto = v.tipoAcquisizione === "noleggio" || v.tipoAcquisizione === "leasing";
  let contractPct: number | null = null;
  let contractDays: number | null = null;
  if (conContratto && v.dataFineNoleggio) {
    contractDays = daysUntil(v.dataFineNoleggio);
    if (v.dataInizioNoleggio) {
      const start = new Date(`${v.dataInizioNoleggio}T00:00:00`).getTime();
      const end = new Date(`${v.dataFineNoleggio}T00:00:00`).getTime();
      contractPct = (Date.now() - start) / Math.max(1, end - start);
    }
  }
  const kmContratto = conContratto ? calcolaKmContratto(v, refs, contractDays) : null;

  const refsDesc = [...refs].reverse();

  // -------------------------------------------------------------------------
  // Cronologia: vita del mezzo
  // -------------------------------------------------------------------------
  type Ev = {
    dateIso: string;
    kind: "acquisto" | "noleggio" | "fine_noleggio" | "manutenzione" | "rifornimento" | "multa" | "scadenza";
    title: string;
    sub?: string;
    amount?: string | null;
    badgeDays?: number;
  };

  const events: Ev[] = [
    ...(v.dataAcquisto
      ? [{ dateIso: v.dataAcquisto, kind: "acquisto" as const, title: "Acquisto veicolo", sub: "Immatricolazione in flotta", amount: v.prezzoAcquisto }]
      : []),
    ...(v.dataInizioNoleggio
      ? [{ dateIso: v.dataInizioNoleggio, kind: "noleggio" as const, title: `Inizio noleggio${v.societaNoleggio ? ` · ${v.societaNoleggio}` : ""}`, sub: v.canoneMensile ? `Canone ${fmtEur(v.canoneMensile)}/mese` : undefined, amount: null }]
      : []),
    ...(v.dataFineNoleggio
      ? [{ dateIso: v.dataFineNoleggio, kind: "fine_noleggio" as const, title: "Fine contratto di noleggio", sub: v.societaNoleggio ?? undefined, amount: null, badgeDays: daysUntil(v.dataFineNoleggio) }]
      : []),
    ...mans.map((m) => ({
      dateIso: m.data,
      kind: "manutenzione" as const,
      title: MANUT_LABEL[m.tipo] ?? m.tipo,
      sub: [m.descrizione, m.officina].filter(Boolean).join(" · ") || undefined,
      amount: m.costo,
    })),
    ...refs.map((r) => ({
      dateIso: r.data,
      kind: "rifornimento" as const,
      title: `Rifornimento · ${Number(r.litri).toFixed(1)} l`,
      sub: `${fmtNum(r.km)} km`,
      amount: r.costo,
    })),
    ...fns.map((f) => ({
      dateIso: f.data,
      kind: "multa" as const,
      title: `Multa · ${f.motivo}`,
      sub: [f.luogo, f.conducente ? `alla guida: ${f.conducente}` : null].filter(Boolean).join(" · ") || undefined,
      amount: f.importo,
    })),
    ...dls.map((d) => ({
      dateIso: d.scadenza,
      kind: "scadenza" as const,
      title: `Scadenza · ${SCADENZA_LABEL[d.tipo] ?? d.tipo}`,
      sub: d.note ?? undefined,
      amount: d.costo,
      badgeDays: daysUntil(d.scadenza),
    })),
  ]
    .sort((a, b) => (a.dateIso < b.dateIso ? 1 : -1))
    .slice(0, 80);

  const EV_STYLE: Record<Ev["kind"], { icon: LucideIcon; cls: string }> = {
    acquisto: { icon: ShoppingBag, cls: "bg-ink-950 text-volt-500" },
    noleggio: { icon: Building2, cls: "bg-ink-950 text-volt-500" },
    fine_noleggio: { icon: CalendarClock, cls: "bg-sky/15 text-sky" },
    manutenzione: { icon: Wrench, cls: "bg-ink-950/[0.06] text-ink-800" },
    rifornimento: { icon: Fuel, cls: "bg-volt-300 text-ink-900" },
    multa: { icon: Siren, cls: "bg-danger/10 text-danger" },
    scadenza: { icon: CalendarClock, cls: "bg-amber/15 text-[#96600d]" },
  };

  // -------------------------------------------------------------------------
  // Tab
  // -------------------------------------------------------------------------

  const panes: Pane[] = [
    {
      key: "panoramica",
      label: "Panoramica",
      icon: "info",
      content: (
        <PanoramicaTab
          v={v}
          contractPct={contractPct}
          contractDays={contractDays}
          kmContratto={kmContratto}
          service={service}
        />
      ),
    },
    {
      key: "cronologia",
      label: "Cronologia",
      icon: "history",
      count: events.length,
      content: (
        <SectionCard title="Vita del mezzo — tutti gli eventi in ordine cronologico">
          {events.length === 0 ? (
            <Empty icon={CalendarDays} title="Nessun evento" sub="Registra rifornimenti, manutenzioni, multe e scadenze: qui comparirà la storia completa." />
          ) : (
            <div className="relative">
              <span className="absolute bottom-2 left-[22px] top-2 w-px bg-line" aria-hidden />
              <div className="space-y-1">
                {events.map((e, i) => {
                  const st = EV_STYLE[e.kind];
                  const Icon = st.icon;
                  return (
                    <div key={i} className="relative flex items-start gap-4 rounded-2xl px-1 py-3 transition-colors hover:bg-paper/70">
                      <span className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-4 ring-card ${st.cls}`}>
                        <Icon className="h-4.5 w-4.5" strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <p className="text-sm font-bold">{e.title}</p>
                          {typeof e.badgeDays === "number" ? <DueChip days={e.badgeDays} /> : null}
                        </div>
                        {e.sub ? <p className="mt-0.5 text-xs text-mute">{e.sub}</p> : null}
                        <p className="mt-0.5 font-mono text-[11px] font-semibold text-mute">
                          {fmtDateLong(e.dateIso)}
                        </p>
                      </div>
                      {e.amount ? (
                        <span className="shrink-0 pt-1 font-mono text-sm font-bold">{fmtEur(e.amount, 2)}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </SectionCard>
      ),
    },
    {
      key: "manutenzioni",
      label: "Manutenzioni",
      icon: "wrench",
      count: mans.length,
      content: (
        <SectionCard title={`Storico interventi · spesa totale ${fmtEur(spesaManutTot)}`} pad={false}>
          {mans.length === 0 ? (
            <div className="p-5">
              <Empty icon={Wrench} title="Nessuna manutenzione" sub="Registra il primo intervento con il pulsante in alto." />
            </div>
          ) : (
            <div className="divide-y divide-line">
              {mans.map((m) => {
                const Icon = MANUT_ICON[m.tipo] ?? Wrench;
                return (
                  <div key={m.id} className="flex items-start gap-4 px-5 py-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-950/[0.05] text-ink-800">
                      <Icon className="h-4.5 w-4.5" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-sm font-extrabold uppercase tracking-wide">
                          {MANUT_LABEL[m.tipo] ?? m.tipo}
                        </p>
                        <span className="text-xs text-mute">{fmtDateLong(m.data)}</span>
                      </div>
                      {m.descrizione ? <p className="mt-1 text-sm font-bold text-ink-800">{m.descrizione}</p> : null}
                      {m.dettaglioLavori ? (
                        <p className="mt-1 rounded-lg bg-paper p-2 text-xs text-ink-700 italic border border-line">
                          {m.dettaglioLavori}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-mute">
                        {[m.officina, m.km !== null ? `${fmtNum(m.km)} km` : null].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {m.prossimoKm || m.prossimaData ? (
                        <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-sky/10 px-2.5 py-0.5 text-[11px] font-bold text-sky">
                          <CalendarClock className="h-3 w-3" />
                          Prossimo:{" "}
                          {[
                            m.prossimoKm ? `a ${fmtNum(m.prossimoKm)} km` : null,
                            m.prossimaData ? `il ${fmtDate(m.prossimaData)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" oppure ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="font-mono text-sm font-bold">{fmtEur(m.costo)}</span>
                      <EditMaintenanceButton initial={m} />
                      <DeleteButton action={deleteMaintenance.bind(null, m.id)} label="Elimina manutenzione" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      ),
    },
    {
      key: "diario",
      label: "Diario Autisti",
      icon: "user",
      count: logs.length,
      content: (
        <SectionCard title="Autisti e km del mese" pad={false}>
          {logs.length === 0 ? (
            <div className="p-5">
              <Empty
                icon={User}
                title="Nessun autista registrato"
                sub="Registra l'autista del mese con i km di inizio e fine mese."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="th">Mese</th>
                    <th className="th">Autista</th>
                    <th className="th text-right">Km inizio mese</th>
                    <th className="th text-right">Km fine mese</th>
                    <th className="th text-right">Km percorsi</th>
                    <th className="th">Note</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {logs.map((log) => {
                    const percorsi =
                      log.kmInizio !== null && log.kmFine !== null && log.kmFine >= log.kmInizio
                        ? log.kmFine - log.kmInizio
                        : null;
                    // registrazioni fatte quando il diario era giornaliero
                    const giornaliera = log.data.slice(8, 10) !== "01";
                    return (
                      <tr key={log.id} className="transition-colors hover:bg-paper/60">
                        <td className="td font-semibold">
                          <span className="capitalize">{fmtMese(log.data)}</span>
                          {giornaliera ? (
                            <span className="block text-[11px] font-normal text-mute">
                              registrazione del {fmtDate(log.data)}
                            </span>
                          ) : null}
                        </td>
                        <td className="td font-bold">{log.conducente}</td>
                        <td className="td text-right font-mono text-xs">{fmtNum(log.kmInizio)}</td>
                        <td className="td text-right font-mono text-xs">{fmtNum(log.kmFine)}</td>
                        <td className="td text-right font-mono text-xs font-bold">
                          {percorsi !== null ? `${fmtNum(percorsi)} km` : "—"}
                        </td>
                        <td className="td text-xs text-mute italic">{log.note ?? "—"}</td>
                        <td className="td text-right">
                          <DeleteDriverLogButton id={log.id} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ),
    },
    {
      key: "rifornimenti",
      label: "Rifornimenti",
      icon: "fuel",
      count: refs.length,
      content: (
        <SectionCard
          title={
            cons.totaleLitri > 0
              ? `Storico rifornimenti · ${fmtNum(Math.round(cons.totaleLitri))} litri · ${fmtEur(cons.totaleSpeso)}`
              : "Storico rifornimenti"
          }
          pad={false}
        >
          {refsDesc.length === 0 ? (
            <div className="p-5">
              <Empty
                icon={Fuel}
                title="Nessun rifornimento"
                sub={
                  v.carburante === "elettrico"
                    ? "Mezzo elettrico: la ricarica è gestita separatamente."
                    : "Registra almeno due rifornimenti per calcolare il consumo medio."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="th">Data</th>
                    <th className="th text-right">Km</th>
                    <th className="th text-right">Litri</th>
                    <th className="th text-right">€/litro</th>
                    <th className="th text-right">Totale</th>
                    <th className="th text-right">Media tratta</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {refsDesc.map((r) => {
                    const idx = refs.findIndex((x) => x.id === r.id);
                    const prev = idx > 0 ? refs[idx - 1] : null;
                    const delta = prev ? r.km - prev.km : null;
                    const media = delta && delta > 0 ? delta / Number(r.litri) : null;
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-paper/60">
                        <td className="td font-semibold">{fmtDate(r.data)}</td>
                        <td className="td text-right font-mono text-xs font-semibold">{fmtNum(r.km)}</td>
                        <td className="td text-right font-mono text-xs">{Number(r.litri).toFixed(1)}</td>
                        <td className="td text-right font-mono text-xs">
                          {(Number(r.costo) / Number(r.litri)).toFixed(3)} €
                        </td>
                        <td className="td text-right font-mono text-xs font-bold">{fmtEur(r.costo, 2)}</td>
                        <td className="td text-right font-mono text-xs">
                          {media ? <span className="font-bold">{media.toFixed(1)} km/l</span> : <span className="text-mute">—</span>}
                        </td>
                        <td className="td text-right whitespace-nowrap">
                          <EditRefuelButton initial={r} />
                          <DeleteButton action={deleteRefuel.bind(null, r.id)} label="Elimina rifornimento" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ),
    },
    {
      key: "multe",
      label: "Multe",
      icon: "siren",
      count: fns.length,
      content: (
        <SectionCard
          title={
            multeDaPagare.length > 0
              ? `Registro multe · ${multeDaPagare.length} da pagare (${fmtEur(importoDaPagare)})`
              : "Registro multe"
          }
          pad={false}
        >
          {fns.length === 0 ? (
            <div className="p-5">
              <Empty icon={Siren} title="Nessuna multa" sub="Incrociamo le dita che resti così." />
            </div>
          ) : (
            <div className="divide-y divide-line">
              {fns.map((f) => (
                <div key={f.id} className="flex items-start gap-4 px-5 py-4">
                  <DateBlock iso={f.data} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold">{f.motivo}</p>
                      <Pill tone={MULTA_TONE[f.stato] ?? "gray"}>
                        {MULTA_STATO_LABEL[f.stato] ?? f.stato}
                      </Pill>
                      {f.punti ? (
                        <Pill tone="ink">-{f.punti} punti</Pill>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-mute">
                      {[
                        f.luogo,
                        f.numeroVerbale ? `verbale ${f.numeroVerbale}` : null,
                        f.conducente ? `conducente: ${f.conducente}` : null,
                        f.stato === "pagata" && f.dataPagamento ? `pagata il ${fmtDate(f.dataPagamento)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                    {f.note ? <p className="mt-1 text-xs font-semibold text-[#96600d]">{f.note}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="mr-1 font-mono text-sm font-bold">{fmtEur(f.importo, 2)}</span>
                    <FinePaidToggle fineId={f.id} pagata={f.stato === "pagata"} />
                    <EditFineButton initial={f} />
                    <DeleteFineButton id={f.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      ),
    },
    {
      key: "scadenze",
      label: "Scadenze",
      icon: "calendar",
      count: dls.length,
      content: (
        <SectionCard title="Scadenze e pratiche" pad={false}>
          {dls.length === 0 ? (
            <div className="p-5">
              <Empty icon={CalendarClock} title="Nessuna scadenza" sub="Aggiungi assicurazione, revisione, bollo o fine noleggio." />
            </div>
          ) : (
            <div className="divide-y divide-line">
              {dls.map((d) => (
                <div key={d.id} className="flex items-center gap-4 px-5 py-4">
                  <DateBlock iso={d.scadenza} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{SCADENZA_LABEL[d.tipo] ?? d.tipo}</p>
                    {d.note ? <p className="truncate text-xs text-mute">{d.note}</p> : null}
                  </div>
                  {d.costo ? (
                    <span className="hidden font-mono text-sm font-bold sm:block">{fmtEur(d.costo)}</span>
                  ) : null}
                  <DueChip days={daysUntil(d.scadenza)} />
                  <EditDeadlineButton initial={d} />
                  <DeleteButton action={deleteDeadline.bind(null, d.id)} label="Elimina scadenza" />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/mezzi"
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-mute transition-colors hover:text-ink-950"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Tutti i mezzi
      </Link>

      {/* Intestazione scheda */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-5 border-b border-line bg-gradient-to-br from-ink-950 to-ink-800 px-6 py-6 sm:px-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-volt-500 font-display text-xl font-black text-ink-950">
            {v.marca.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 className="font-display text-3xl font-black uppercase leading-none tracking-tight text-white sm:text-4xl">
                {v.marca} {v.modello}
              </h1>
              <Plate targa={v.targa} size="lg" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <Pill tone={STATO_TONE[v.stato] ?? "soft"}>{STATO_LABEL[v.stato] ?? v.stato}</Pill>
              <Pill tone="ink" className="bg-white/10! text-white!">{ACQ_LABEL[v.tipoAcquisizione]}</Pill>
              
              {v.isReplacement === 1 && (
                <Pill tone="red" className="animate-pulse">Mezzo Sostitutivo</Pill>
              )}
              
              {v.hasTelepass === 1 ? (
                <Pill tone="volt" className="text-ink-950!">Telepass Attivo</Pill>
              ) : (
                <Pill tone="gray" className="bg-white/5! text-white/40!">No Telepass</Pill>
              )}

              <span className="flex items-center gap-1.5 text-white/60">
                <User className="h-3.5 w-3.5" /> {v.conducente ?? "Non assegnato"}
              </span>
            </div>
          </div>
          <DeleteButton
            action={deleteVehicle.bind(null, v.id)}
            label="Elimina mezzo"
            confirmText={`Eliminare definitivamente ${v.targa} con tutto lo storico?`}
            iconOnly={false}
          />
        </div>

        {v.stato === "venduto" ? (
          <div className="flex items-center gap-2.5 border-b border-line bg-amber/10 px-6 py-3 text-sm font-semibold text-[#8a5c10] sm:px-8">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            Questo mezzo risulta venduto: la scheda è conservata a solo scopo storico.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 px-6 py-4 sm:px-8">
          <AddRefuelDialog vehicleId={v.id} />
          <AddMaintenanceDialog vehicleId={v.id} />
          <AddDeadlineDialog vehicleId={v.id} />
          <AddFineDialog vehicleId={v.id} />
          <AddDriverLogDialog vehicleId={v.id} kmInizioSuggeriti={logs.find((l) => l.kmFine !== null)?.kmFine ?? null} />
          <Link href={`/mezzi/${v.id}/modifica`} className="btn-ghost h-11!">
            <Pencil className="h-4 w-4" /> Modifica anagrafica
          </Link>
        </div>
      </div>

      {/* KPI scheda */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          icon={Gauge}
          label="Km attuali"
          value={fmtNum(v.kmAttuali)}
          tone={kmContratto && kmContratto.rimanenti < 0 ? "red" : "ink"}
          sub={
            kmContratto
              ? kmContratto.rimanenti >= 0
                ? `restano ${fmtNum(kmContratto.rimanenti)} km su ${fmtNum(kmContratto.massimi)}`
                : `limite di ${fmtNum(kmContratto.massimi)} km superato`
              : "all'ultimo rilevamento"
          }
        />
        <StatCard
          icon={Fuel}
          label="Consumo medio"
          value={cons.kmPerLiter ? `${cons.kmPerLiter.toFixed(1)} km/l` : "—"}
          tone="volt"
          sub={cons.distanzaCoperta > 0 ? `su ${fmtNum(cons.distanzaCoperta)} km rilevati` : "servono 2+ rifornimenti"}
        />
        <StatCard
          icon={CircleDollarSign}
          label="Costo carburante/km"
          value={cons.eurPerKm ? fmtEur(cons.eurPerKm, 2) : "—"}
          sub={cons.eurPerLiter ? `prezzo medio ${cons.eurPerLiter.toFixed(3)} €/l` : undefined}
        />
        <StatCard icon={Banknote} label="Uscite 30 giorni" value={fmtEur(spesa30)} sub="carburante + manutenzioni" />
        <StatCard
          icon={Siren}
          label="Multe da pagare"
          value={String(multeDaPagare.length)}
          tone={multeDaPagare.length > 0 ? "red" : "ink"}
          sub={
            multeDaPagare.length > 0
              ? `${fmtEur(importoDaPagare)} · ${fmtNum(puntiTotali)} punti complessivi`
              : `${fmtNum(puntiTotali)} punti decurtati totali`
          }
        />
      </div>

      <VTabs panes={panes} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab panoramica (server-rendered)
// ---------------------------------------------------------------------------

function PanoramicaTab({
  v,
  contractPct,
  contractDays,
  kmContratto: km,
  service,
}: {
  v: Vehicle;
  contractPct: number | null;
  contractDays: number | null;
  kmContratto: KmContratto | null;
  service: { kmRimanenti: number; prossimoKm: number; base: Maintenance } | null;
}) {
  const kmTone: "red" | "amber" | "volt" = !km
    ? "volt"
    : km.rimanenti < 0
      ? "red"
      : km.pct >= 0.9 || (km.stimaFine !== null && km.stimaFine > km.massimi)
        ? "amber"
        : "volt";
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Acquisizione */}
      <SectionCard title={v.tipoAcquisizione === "acquisto" || v.tipoAcquisizione === "riscatto" ? "Dati Proprietà" : "Dati Contratto"}>
        <div className="divide-y divide-dashed divide-line">
          <Row label="Tipologia">{ACQ_LABEL[v.tipoAcquisizione]}</Row>
          
          {(v.tipoAcquisizione === "noleggio" || v.tipoAcquisizione === "leasing") && (
            <>
              <Row label="Società">{v.societaNoleggio ?? "—"}</Row>
              <Row label="N. Contratto">
                <span className="font-mono font-bold">{v.numeroContratto ?? "—"}</span>
              </Row>
              <Row label="Canone mensile">
                <span className="font-mono font-bold">{fmtEur(v.canoneMensile)}</span>
              </Row>
              <Row label="Scadenza">{fmtDate(v.dataFineNoleggio)}</Row>
              <Row label="Km massimi">
                {v.kmMassimiContratto ? (
                  <span className="font-mono font-bold">{fmtNum(v.kmMassimiContratto)} km</span>
                ) : (
                  <span className="font-normal text-mute">non indicati</span>
                )}
              </Row>
            </>
          )}

          {v.tipoAcquisizione === "acquisto" && (
            <>
              <Row label="Data acquisto">{fmtDate(v.dataAcquisto)}</Row>
              <Row label="Prezzo">{fmtEur(v.prezzoAcquisto)}</Row>
            </>
          )}

          {v.tipoAcquisizione === "riscatto" && (
            <>
              <Row label="Data riscatto">{fmtDate(v.dataAcquisto)}</Row>
              <Row label="Prezzo riscatto">{fmtEur(v.prezzoRiscatto)}</Row>
            </>
          )}
        </div>

        {contractDays !== null ? (
          <div className="mt-4 rounded-2xl bg-paper p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-mute">
                {contractPct !== null ? "Avanzamento contratto" : "Scadenza contratto"}
              </span>
              <DueChip days={contractDays} />
            </div>
            {contractPct !== null ? (
              <>
                <Progress
                  pct={contractPct}
                  tone={contractDays <= 45 ? "red" : contractDays <= 90 ? "amber" : "volt"}
                />
                <p className="mt-2 font-mono text-[11px] text-mute">
                  {Math.round(Math.min(1, Math.max(0, contractPct)) * 100)}% del periodo trascorso
                </p>
              </>
            ) : (
              <p className="font-mono text-[11px] text-mute">
                Termina il {fmtDateLong(v.dataFineNoleggio)}
              </p>
            )}
          </div>
        ) : null}

        {km ? (
          <div className="mt-4 rounded-2xl bg-paper p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-mute">Km del contratto</span>
              {km.rimanenti < 0 ? (
                <Pill tone="red">Superati di {fmtNum(-km.rimanenti)} km</Pill>
              ) : km.stimaFine !== null && km.stimaFine > km.massimi ? (
                <Pill tone="amber">Rischio supero</Pill>
              ) : km.pct >= 0.9 ? (
                <Pill tone="amber">Vicino al limite</Pill>
              ) : (
                <Pill tone="volt">Entro il limite</Pill>
              )}
            </div>
            <Progress pct={km.pct} tone={kmTone} />
            <p className="mt-2 font-mono text-[11px] text-mute">
              {fmtNum(km.attuali)} di {fmtNum(km.massimi)} km ({Math.round(km.pct * 100)}%)
              {km.rimanenti >= 0 ? ` · restano ${fmtNum(km.rimanenti)} km` : ""}
            </p>
            {km.kmMeseDisponibili !== null ? (
              <p className="mt-1.5 text-xs text-mute">
                Fino a fine contratto: in media{" "}
                <span className="font-bold text-ink-950">{fmtNum(Math.round(km.kmMeseDisponibili))} km al mese</span>
              </p>
            ) : null}
            {km.stimaFine !== null && km.ritmoMese !== null ? (
              <p className={`mt-1 text-xs ${km.stimaFine > km.massimi ? "font-semibold text-danger" : "text-mute"}`}>
                Al ritmo attuale (circa {fmtNum(Math.round(km.ritmoMese))} km al mese) a fine contratto: circa{" "}
                {fmtNum(km.stimaFine)} km
                {km.stimaFine > km.massimi ? ` · supero stimato ${fmtNum(km.stimaFine - km.massimi)} km` : ""}
              </p>
            ) : null}
          </div>
        ) : null}
      </SectionCard>

      {/* Anagrafica */}
      <SectionCard title="Dati veicolo">
        <div className="divide-y divide-dashed divide-line">
          <Row label="Categoria">{CATEGORIA_LABEL[v.categoria] ?? v.categoria}</Row>
          <Row label="Anno immatricolazione">
            <span className="font-mono font-bold">{v.annoImmatricolazione ?? "—"}</span>
          </Row>
          <Row label="Alimentazione">
            <Pill tone="soft">{CARB_LABEL[v.carburante] ?? v.carburante}</Pill>
          </Row>
          <Row label="Conducente">
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-mute" /> {v.conducente ?? "Non assegnato"}
            </span>
          </Row>
          <Row label="Acquisizione">{ACQ_LABEL[v.tipoAcquisizione]}</Row>
        </div>
        {v.note ? (
          <div className="mt-4 rounded-2xl bg-paper p-4">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-mute">
              <NotebookText className="h-3.5 w-3.5" /> Note interne
            </p>
            <p className="text-sm leading-relaxed text-ink-800">{v.note}</p>
          </div>
        ) : null}
      </SectionCard>

      {/* Manutenzione programmata */}
      <SectionCard title="Manutenzione programmata">
        {service ? (
          <div>
            <div className="flex items-center gap-3">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                  service.kmRimanenti < 0
                    ? "bg-danger text-white"
                    : service.kmRimanenti < 3000
                      ? "bg-amber text-white"
                      : "bg-ink-950 text-volt-500"
                }`}
              >
                <Wrench className="h-5 w-5" strokeWidth={2.2} />
              </div>
              <div>
                <p className="font-display text-lg font-black leading-tight tracking-tight">
                  {service.kmRimanenti < 0
                    ? `Scaduto da ${fmtNum(-service.kmRimanenti)} km`
                    : `${fmtNum(service.kmRimanenti)} km al tagliando`}
                </p>
                <p className="text-xs text-mute">
                  soglia {fmtNum(service.prossimoKm)} km · ultimo a{" "}
                  {service.base.km ? fmtNum(service.base.km) : "—"} km il {fmtDate(service.base.data)}
                </p>
              </div>
            </div>
            <div className="mt-5">
              <Progress
                pct={v.kmAttuali / service.prossimoKm}
                tone={service.kmRimanenti < 0 ? "red" : service.kmRimanenti < 3000 ? "amber" : "volt"}
              />
              <p className="mt-2 flex items-center gap-1.5 text-xs text-mute">
                <CalendarDays className="h-3.5 w-3.5" />
                {service.base.prossimaData
                  ? `Entro il ${fmtDateLong(service.base.prossimaData)} o alla soglia km`
                  : "Nessuna data limite impostata, solo soglia chilometrica"}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-sm text-mute">
            <Wrench className="mb-3 h-6 w-6 text-mute/50" strokeWidth={1.8} />
            Nessun tagliando programmato. Quando registri una manutenzione puoi indicare il km del
            prossimo intervento: qui vedrai il conto alla rovescia.
          </div>
        )}
      </SectionCard>
    </div>
  );
}


