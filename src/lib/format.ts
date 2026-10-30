// Utility di formattazione e calcolo condivise

export const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfToday(): number {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
}

/** Giorni mancanti alla data (negativo = scaduta) */
export function daysUntil(dateIso: string): number {
  const target = new Date(`${dateIso}T00:00:00`).getTime();
  return Math.ceil((target - startOfToday()) / DAY_MS);
}

export function fmtDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    ...(withYear ? { year: "numeric" as const } : {}),
  }).format(d);
}

export function fmtDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function fmtEur(v: number | string | null | undefined, decimals = 0): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("it-IT").format(v);
}

export function fmtKm(v: number | null | undefined): string {
  if (v === null || v === undefined) return "— km";
  return `${fmtNum(v)} km`;
}

/** Mese corrente come "2026-03" */
export function currentMonthKey(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** "2026-10-01" (o "2026-10") → "ottobre 2026" */
export function fmtMese(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return "—";
  return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", { month: "short" }).format(new Date(y, m - 1, 1));
}

export function lastNMonthKeys(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Etichette dominio
// ---------------------------------------------------------------------------

export const STATO_LABEL: Record<string, string> = {
  attivo: "Attivo",
  in_manutenzione: "In manutenzione",
  fermo: "Fermo",
  venduto: "Venduto",
};

export const ACQ_LABEL: Record<string, string> = {
  acquisto: "Acquisto",
  noleggio: "Noleggio",
  leasing: "Leasing",
  riscatto: "Riscatto",
};

export const CARB_LABEL: Record<string, string> = {
  diesel: "Diesel",
  benzina: "Benzina",
  gpl: "GPL",
  metano: "Metano",
  ibrido: "Ibrido",
  elettrico: "Elettrico",
};

export const MANUT_LABEL: Record<string, string> = {
  tagliando: "Tagliando",
  gomme: "Gomme",
  freni: "Freni",
  riparazione: "Riparazione",
  revisione: "Revisione",
  altro: "Altro",
};

export const SCADENZA_LABEL: Record<string, string> = {
  assicurazione: "Assicurazione",
  revisione: "Revisione",
  bollo: "Bollo",
  noleggio: "Fine noleggio",
  altro: "Altro",
};

export const MULTA_STATO_LABEL: Record<string, string> = {
  da_pagare: "Da pagare",
  pagata: "Pagata",
  contestata: "Contestata",
};

export const CATEGORIA_LABEL: Record<string, string> = {
  auto: "Auto",
  furgone: "Furgone",
  camion: "Camion",
  altro: "Altro",
};
