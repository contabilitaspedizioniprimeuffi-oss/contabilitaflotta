// Pedaggi: l'importo si salva IVA esclusa (come nel file Telepass convertito) insieme
// all'aliquota IVA; in tutto il programma si mostra e si somma l'importo IVA inclusa.

export const IVA_PEDAGGI_PREDEFINITA = 22;

function aliquota(iva: string | number | null | undefined): number {
  if (iva === null || iva === undefined || iva === "") return IVA_PEDAGGI_PREDEFINITA;
  const n = Number(iva);
  return Number.isFinite(n) ? n : IVA_PEDAGGI_PREDEFINITA;
}

/** Importo IVA inclusa, arrotondato al centesimo (es. 1 € + IVA 22% → 1,22 €) */
export function importoConIva(importo: string | number, iva: string | number | null | undefined): number {
  const netto = Number(importo);
  if (!Number.isFinite(netto)) return 0;
  return Math.round(netto * (1 + aliquota(iva) / 100) * 100) / 100;
}

/** Somma degli importi IVA inclusa (ogni riga arrotondata al centesimo, come in fattura) */
export function totaleConIva(righe: { importo: string; iva: string | null }[]): number {
  return Math.round(righe.reduce((s, r) => s + importoConIva(r.importo, r.iva), 0) * 100) / 100;
}
