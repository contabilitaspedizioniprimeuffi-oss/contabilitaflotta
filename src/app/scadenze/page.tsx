import { AlertTriangle, CalendarClock, CheckCircle2, Clock4 } from "lucide-react";
import Link from "next/link";
import Plate from "@/components/plate";
import { DueChip, PageHeader, Pill, SectionCard } from "@/components/ui";
import { listDeadlinesJoin } from "@/lib/data";
import { daysUntil, fmtDateLong, fmtEur, fmtNum, SCADENZA_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

type Item = Awaited<ReturnType<typeof listDeadlinesJoin>>[number] & { days: number };

function Group({
  title,
  icon: Icon,
  tone,
  items,
}: {
  title: string;
  icon: typeof AlertTriangle;
  tone: "red" | "amber" | "sky" | "gray";
  items: Item[];
}) {
  if (items.length === 0) return null;
  const bar =
    tone === "red"
      ? "bg-danger"
      : tone === "amber"
        ? "bg-amber"
        : tone === "sky"
          ? "bg-sky"
          : "bg-ink-950/30";
  return (
    <SectionCard pad={false} className="overflow-hidden">
      <header className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className={`h-8 w-1.5 rounded-full ${bar}`} />
        <Icon
          className={`h-4.5 w-4.5 ${
            tone === "red" ? "text-danger" : tone === "amber" ? "text-amber" : tone === "sky" ? "text-sky" : "text-mute"
          }`}
        />
        <h2 className="font-display text-sm font-extrabold uppercase tracking-[0.08em]">{title}</h2>
        <Pill tone={tone === "gray" ? "gray" : tone} className="ml-auto">
          {items.length}
        </Pill>
      </header>
      <div className="divide-y divide-line">
        {items.map((x) => (
          <Link
            key={x.d.id}
            href={`/mezzi/${x.d.vehicleId}`}
            className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper/60"
          >
            <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-paper font-mono">
              <span className="text-sm font-black leading-none">{x.d.scadenza.slice(8, 10)}</span>
              <span className="text-[9px] font-bold uppercase text-mute">
                {new Intl.DateTimeFormat("it-IT", { month: "short" }).format(
                  new Date(`${x.d.scadenza}T00:00:00`)
                )}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{SCADENZA_LABEL[x.d.tipo] ?? x.d.tipo}</p>
              <p className="flex items-center gap-2 text-xs text-mute">
                <Plate targa={x.targa} size="sm" />
                <span className="truncate">
                  {x.marca} {x.modello} · {fmtDateLong(x.d.scadenza)}
                </span>
              </p>
              {x.d.note ? <p className="mt-0.5 truncate text-xs font-semibold text-[#96600d]">{x.d.note}</p> : null}
            </div>
            {x.d.costo ? (
              <span className="hidden font-mono text-sm font-bold sm:block">{fmtEur(x.d.costo)}</span>
            ) : null}
            <DueChip days={x.days} />
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}

export default async function ScadenzePage() {
  const all = await listDeadlinesJoin();
  const items: Item[] = all
    .filter((x) => x.stato !== "venduto")
    .map((x) => ({ ...x, days: daysUntil(x.d.scadenza) }))
    .sort((a, b) => a.days - b.days);

  const scadute = items.filter((x) => x.days < 0);
  const imminenti = items.filter((x) => x.days >= 0 && x.days <= 30);
  const inArrivo = items.filter((x) => x.days > 30 && x.days <= 90);
  const oltre = items.filter((x) => x.days > 90);

  const totScaduto = scadute.reduce((s, x) => s + Number(x.d.costo ?? 0), 0);

  const stats = [
    { label: "Scadute", value: scadute.length, tone: "text-danger", icon: AlertTriangle },
    { label: "Entro 30 giorni", value: imminenti.length, tone: "text-amber", icon: Clock4 },
    { label: "Entro 90 giorni", value: inArrivo.length, tone: "text-sky", icon: CalendarClock },
    { label: "Oltre 90 giorni", value: oltre.length, tone: "text-mute", icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Burocrazia"
        title="Scadenze"
        sub={`Assicurazioni, revisioni, bolli e fine dei contratti di noleggio. Costo già scaduto: ${fmtEur(totScaduto)}.`}
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card flex items-center gap-4 p-5">
            <s.icon className={`h-6 w-6 ${s.tone}`} strokeWidth={2} />
            <div>
              <p className="font-display text-2xl font-black leading-none">{s.value}</p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-mute">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <Group title="Scadute — da regolarizzare subito" icon={AlertTriangle} tone="red" items={scadute} />
        <Group title="In scadenza entro 30 giorni" icon={Clock4} tone="amber" items={imminenti} />
        <Group title="In arrivo entro 90 giorni" icon={CalendarClock} tone="sky" items={inArrivo} />
        <Group title="Oltre 90 giorni" icon={CheckCircle2} tone="gray" items={oltre} />
      </div>

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-mute">
          Nessuna scadenza registrata: apri la scheda di un mezzo per aggiungerne una.
        </p>
      ) : (
        <p className="pb-4 text-center text-[11px] uppercase tracking-[0.18em] text-mute/70">
          {fmtNum(items.length)} scadenze monitorate su tutta la flotta
        </p>
      )}
    </div>
  );
}
