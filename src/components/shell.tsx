"use client";

import {
  CalendarClock,
  Fuel,
  LayoutDashboard,
  Siren,
  Truck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import GithubSync from "@/components/github-sync";
import SyncButton from "@/components/sync-button";

const NAV = [
  { href: "/", label: "Panoramica", sub: "cruscotto flotta", icon: LayoutDashboard },
  { href: "/mezzi", label: "Mezzi", sub: "anagrafiche veicoli", icon: Truck },
  { href: "/scadenze", label: "Scadenze", sub: "assicurazioni e bolli", icon: CalendarClock },
  { href: "/manutenzioni", label: "Manutenzioni", sub: "tagliandi e riparazioni", icon: Wrench },
  { href: "/rifornimenti", label: "Rifornimenti", sub: "carburante e consumi", icon: Fuel },
  { href: "/multe", label: "Multe", sub: "verbali e punti", icon: Siren },
];

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const today = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/[0.06] bg-ink-950 lg:flex">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 pb-6 pt-7">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-volt-500 text-ink-950 shadow-[0_8px_24px_-8px_rgba(204,239,69,0.6)]">
            <Truck className="h-5 w-5" strokeWidth={2.4} />
          </div>
          <div>
            <p className="font-display text-lg font-black uppercase leading-none tracking-tight text-white">
              Flotta<span className="text-volt-500">·</span>OS
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
              Controllo automezzi
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 ${
                  active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
                }`}
              >
                <span
                  className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full transition-all duration-200 ${
                    active ? "bg-volt-500" : "bg-transparent group-hover:bg-white/20"
                  }`}
                />
                <item.icon
                  className={`h-[18px] w-[18px] transition-colors ${
                    active ? "text-volt-500" : "text-white/45 group-hover:text-white/80"
                  }`}
                  strokeWidth={2.2}
                />
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-semibold leading-tight ${
                      active ? "text-white" : "text-white/70 group-hover:text-white"
                    }`}
                  >
                    {item.label}
                  </span>
                  <span className="block truncate text-[10px] uppercase tracking-[0.14em] text-white/30">
                    {item.sub}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Sync Action */}
        <div className="space-y-2 px-3 pb-2 pt-1">
          <SyncButton variant="sidebar" />
          <GithubSync />
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-volt-500">
              Uso interno
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-white/50">
              Strumento aziendale per il monitoraggio del parco mezzi.
            </p>
            <p className="mt-3 font-mono text-[10px] capitalize text-white/30">{today}</p>
          </div>
        </div>
      </aside>

      {/* Header mobile */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-volt-500 text-ink-950">
          <Truck className="h-4.5 w-4.5" strokeWidth={2.4} />
        </div>
        <p className="font-display text-base font-black uppercase tracking-tight">
          Flotta<span className="text-volt-600">·</span>OS
        </p>
        <MobileNav pathname={pathname} />
      </div>

      {/* Contenuto */}
      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-[1380px] animate-rise px-4 py-7 sm:px-8 lg:px-10 lg:py-9">
          {children}
        </div>
      </main>
    </div>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  return (
    <div className="ml-auto flex gap-1 overflow-x-auto">
      {NAV.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
              active ? "bg-ink-950 text-volt-500" : "text-mute hover:text-ink-900"
            }`}
          >
            <item.icon className="h-4 w-4" strokeWidth={2.2} />
          </Link>
        );
      })}
    </div>
  );
}
