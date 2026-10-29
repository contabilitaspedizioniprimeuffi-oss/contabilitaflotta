import { CheckCircle2, ChevronRight, CircleAlert, Filter, Scale, Siren } from "lucide-react";
import Link from "next/link";
import { AddFineDialog, DeleteFineButton, EditFineButton, FinePaidToggle } from "@/components/dialogs";
import Plate from "@/components/plate";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { listFinesJoin, listVehicles } from "@/lib/data";
import { fmtDate, fmtEur, fmtNum, MULTA_STATO_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

const MULTA_TONE: Record<string, "red" | "volt" | "amber"> = {
  da_pagare: "red",
  pagata: "volt",
  contestata: "amber",
};

export default async function MultePage(props: {
  searchParams: Promise<{ stato?: string; mezzo?: string }>;
}) {
  const { stato = "", mezzo = "" } = await props.searchParams;
  const vid = mezzo ? Number(mezzo) : null;

  const [rows, vs] = await Promise.all([listFinesJoin(stato || null, vid), listVehicles()]);
  const all = await listFinesJoin(null, null);

  const daPagare = all.filter((x) => x.f.stato === "da_pagare");
  const contestate = all.filter((x) => x.f.stato === "contestata");
  const pagate = all.filter((x) => x.f.stato === "pagata");
  const importoDaPagare = daPagare.reduce((s, x) => s + Number(x.f.importo), 0);
  const importoPagate = pagate.reduce((s, x) => s + Number(x.f.importo), 0);
  const puntiTotali = all.reduce((s, x) => s + (x.f.punti ?? 0), 0);

  const stats = [
    { icon: CircleAlert, label: "Da pagare", value: String(daPagare.length), sub: fmtEur(importoDaPagare), cls: "text-danger" },
    { icon: Scale, label: "Contestate", value: String(contestate.length), sub: "ricorso in corso", cls: "text-amber" },
    { icon: CheckCircle2, label: "Pagate", value: String(pagate.length), sub: fmtEur(importoPagate), cls: "text-volt-700" },
    { icon: Siren, label: "Punti decurtati", value: fmtNum(puntiTotali), sub: "su tutta la flotta", cls: "text-ink-950" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contenzioso"
        title="Multe"
        sub="Registro verbali di tutta la flotta: importi, punti decurtati, conducente e stato del pagamento."
        actions={
          vs.length > 0 ? (
            <AddFineDialog
              vehicles={vs
                .filter((v) => v.stato !== "venduto")
                .map((v) => ({ id: v.id, targa: v.targa, marca: v.marca, modello: v.modello }))}
            />
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card flex items-center gap-4 p-5">
            <s.icon className={`h-6 w-6 shrink-0 ${s.cls}`} strokeWidth={2} />
            <div className="min-w-0">
              <p className="font-display text-2xl font-black leading-none">{s.value}</p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-mute">{s.label}</p>
              <p className="font-mono text-[11px] font-semibold text-mute">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <form method="GET" className="card flex flex-wrap items-center gap-3 p-4">
        <Filter className="h-4 w-4 text-mute" />
        <select className="input w-48!" name="stato" defaultValue={stato}>
          <option value="">Tutti gli stati</option>
          <option value="da_pagare">Da pagare</option>
          <option value="pagata">Pagata</option>
          <option value="contestata">Contestata</option>
        </select>
        <select className="input w-64!" name="mezzo" defaultValue={mezzo}>
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
          {rows.length} verbali
        </span>
      </form>

      {rows.length === 0 ? (
        <Empty
          icon={Siren}
          title="Nessuna multa registrata"
          sub={vs.length === 0 ? "Registra prima un mezzo dalla sezione Mezzi." : "Registra la prima multa dal pulsante in alto o dalla scheda del mezzo."}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-line">
            {rows.map((x) => (
              <div key={x.f.id} className="flex items-start gap-4 px-5 py-4">
                <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-paper font-mono">
                  <span className="text-sm font-black leading-none">{x.f.data.slice(8, 10)}</span>
                  <span className="text-[9px] font-bold uppercase text-mute">
                    {new Intl.DateTimeFormat("it-IT", { month: "short" }).format(
                      new Date(`${x.f.data}T00:00:00`)
                    )}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold">{x.f.motivo}</p>
                    <Pill tone={MULTA_TONE[x.f.stato] ?? "gray"}>
                      {MULTA_STATO_LABEL[x.f.stato] ?? x.f.stato}
                    </Pill>
                    {x.f.punti ? <Pill tone="ink">-{x.f.punti} punti</Pill> : null}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mute">
                    <Link href={`/mezzi/${x.f.vehicleId}`} className="hover:opacity-80">
                      <Plate targa={x.targa} size="sm" />
                    </Link>
                    <span className="truncate">
                      {x.marca} {x.modello}
                      {[x.f.luogo, x.f.conducente ? `conducente: ${x.f.conducente}` : null]
                        .filter(Boolean)
                        .map((s) => ` · ${s}`)
                        .join("")}
                    </span>
                  </p>
                  {x.f.note ? (
                    <p className="mt-0.5 text-xs font-semibold text-[#96600d]">{x.f.note}</p>
                  ) : null}
                  {x.f.stato === "pagata" && x.f.dataPagamento ? (
                    <p className="mt-0.5 text-[11px] text-mute">Pagata il {fmtDate(x.f.dataPagamento)}</p>
                  ) : null}
                </div>
                <span className="hidden shrink-0 font-mono text-sm font-bold sm:block">
                  {fmtEur(x.f.importo, 2)}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <FinePaidToggle fineId={x.f.id} pagata={x.f.stato === "pagata"} />
                  <EditFineButton initial={x.f} />
                  <DeleteFineButton id={x.f.id} />
                </div>
                <Link
                  href={`/mezzi/${x.f.vehicleId}`}
                  className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-mute transition-colors hover:bg-ink-950/5 hover:text-ink-950 md:flex"
                  aria-label="Apri scheda mezzo"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
