import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Pill / badge
// ---------------------------------------------------------------------------

export type PillTone = "volt" | "soft" | "amber" | "red" | "sky" | "gray" | "ink";

const PILL_TONES: Record<PillTone, string> = {
  volt: "bg-volt-500 text-ink-950",
  ink: "bg-ink-950 text-white",
  soft: "border border-line bg-paper text-ink-800",
  amber: "bg-amber/15 text-[#96600d]",
  red: "bg-danger/10 text-danger",
  sky: "bg-sky/10 text-sky",
  gray: "bg-ink-950/[0.06] text-mute",
};

export function Pill({
  tone = "soft",
  children,
  className = "",
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${PILL_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export const STATO_TONE: Record<string, PillTone> = {
  attivo: "volt",
  in_manutenzione: "amber",
  fermo: "gray",
  venduto: "ink",
};

// ---------------------------------------------------------------------------
// Chip scadenza con countdown
// ---------------------------------------------------------------------------

export function DueChip({ days }: { days: number }) {
  if (days < 0) {
    return <Pill tone="red">Scaduta da {-days} g</Pill>;
  }
  if (days === 0) return <Pill tone="red">Scade oggi</Pill>;
  if (days <= 15) return <Pill tone="red">Tra {days} g</Pill>;
  if (days <= 45) return <Pill tone="amber">Tra {days} g</Pill>;
  return <Pill tone="gray">Tra {days} g</Pill>;
}

// ---------------------------------------------------------------------------
// Header di pagina
// ---------------------------------------------------------------------------

export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h1 className="font-display text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-5xl">
          {title}
        </h1>
        {sub ? <p className="mt-3 max-w-xl text-sm text-mute">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card statistica
// ---------------------------------------------------------------------------

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "ink",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: "ink" | "volt" | "red" | "amber";
}) {
  const tile =
    tone === "volt"
      ? "bg-volt-500 text-ink-950"
      : tone === "red"
        ? "bg-danger text-white"
        : tone === "amber"
          ? "bg-amber text-white"
          : "bg-ink-950 text-volt-500";
  return (
    <div className="card flex items-start gap-4 p-5">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tile}`}
      >
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <p className="eyebrow text-[10px]!">{label}</p>
        <p className="mt-1 font-display text-[26px] font-black leading-none tracking-tight">
          {value}
        </p>
        {sub ? <div className="mt-1.5 text-xs text-mute">{sub}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card sezione
// ---------------------------------------------------------------------------

export function SectionCard({
  title,
  action,
  children,
  className = "",
  pad = true,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="font-display text-sm font-extrabold uppercase tracking-[0.08em]">
            {title}
          </h2>
          {action}
        </header>
      ) : null}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function Empty({
  icon: Icon,
  title,
  sub,
}: {
  icon: LucideIcon;
  title: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-950/[0.05] text-mute">
        <Icon className="h-6 w-6" strokeWidth={1.8} />
      </div>
      <p className="mt-4 font-display text-sm font-extrabold uppercase tracking-wide">{title}</p>
      {sub ? <p className="mt-1 max-w-xs text-xs text-mute">{sub}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barra di avanzamento
// ---------------------------------------------------------------------------

export function Progress({
  pct,
  tone = "volt",
  className = "",
}: {
  /** 0..1 */
  pct: number;
  tone?: "volt" | "amber" | "red";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(1, pct));
  const fill =
    tone === "red" ? "bg-danger" : tone === "amber" ? "bg-amber" : "bg-volt-600";
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-ink-950/[0.08] ${className}`}>
      <div
        className={`h-full rounded-full ${fill} transition-all duration-500`}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}
