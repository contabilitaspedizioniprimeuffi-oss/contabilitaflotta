"use client";

import { CalendarClock, Fuel, History, Info, Siren, User, Wrench } from "lucide-react";
import { useState, type ReactNode } from "react";

const ICONS = {
  info: Info,
  wrench: Wrench,
  fuel: Fuel,
  calendar: CalendarClock,
  history: History,
  siren: Siren,
  user: User,
} as const;

export type TabIcon = keyof typeof ICONS;

export type Pane = {
  key: string;
  label: string;
  icon: TabIcon;
  count?: number;
  content: ReactNode;
};

export default function VTabs({ panes }: { panes: Pane[] }) {
  const [active, setActive] = useState(panes[0]?.key);

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-1.5 rounded-2xl border border-line bg-card p-1.5">
        {panes.map((p) => {
          const Icon = ICONS[p.icon];
          const is = p.key === active;
          return (
            <button
              key={p.key}
              onClick={() => setActive(p.key)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-200 ${
                is
                  ? "bg-ink-950 text-volt-500 shadow-[0_6px_16px_-6px_rgba(12,14,11,0.5)]"
                  : "text-mute hover:bg-paper hover:text-ink-900"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={2.2} />
              {p.label}
              {typeof p.count === "number" ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                    is ? "bg-volt-500/20 text-volt-300" : "bg-ink-950/[0.07] text-mute"
                  }`}
                >
                  {p.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {panes.map((p) => (
        <div key={p.key} className={p.key === active ? "animate-rise" : "hidden"}>
          {p.content}
        </div>
      ))}
    </div>
  );
}
