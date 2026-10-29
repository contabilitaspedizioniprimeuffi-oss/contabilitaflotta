// Grafici leggeri senza dipendenze esterne (div/SVG)

export function MonthlyBars({
  data,
  suffix = "€",
}: {
  data: { label: string; value: number; current?: boolean }[];
  suffix?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="flex h-44 items-end gap-2 sm:gap-3">
        {data.map((d) => (
          <div key={d.label} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className="font-mono text-[10px] font-semibold text-mute opacity-0 transition-opacity group-hover:opacity-100">
              {d.value.toLocaleString("it-IT", { maximumFractionDigits: 0 })}
              {suffix}
            </span>
            <div
              className={`w-full max-w-12 rounded-t-lg transition-all duration-300 group-hover:brightness-110 ${
                d.current ? "bg-volt-500" : "bg-ink-950/85"
              }`}
              style={{ height: `${Math.max(3, (d.value / max) * 100)}%` }}
              title={`${d.label}: ${d.value.toLocaleString("it-IT")} ${suffix}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 border-t border-line pt-2 sm:gap-3">
        {data.map((d) => (
          <div
            key={d.label}
            className={`flex-1 text-center text-[10px] font-bold uppercase tracking-wider ${
              d.current ? "text-ink-950" : "text-mute"
            }`}
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HBar({
  label,
  valueText,
  pct,
  sub,
}: {
  label: string;
  valueText: string;
  /** 0..1 */
  pct: number;
  sub?: string;
}) {
  const clamped = Math.max(0.02, Math.min(1, pct));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="truncate text-xs font-bold">{label}</span>
        <span className="shrink-0 font-mono text-xs font-semibold text-ink-800">{valueText}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-950/[0.07]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-ink-950 to-volt-600"
          style={{ width: `${clamped * 100}%` }}
        />
      </div>
      {sub ? <p className="mt-1 text-[11px] text-mute">{sub}</p> : null}
    </div>
  );
}
