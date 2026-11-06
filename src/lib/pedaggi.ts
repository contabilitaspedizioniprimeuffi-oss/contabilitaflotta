// Pedaggi: l'importo è IVA inclusa, esattamente come stampato nel dettaglio Telepass
// (negativo per sconti e rimborsi). Non si salvano né l'importo senza IVA né l'aliquota.

/** Importo del pedaggio in euro, IVA inclusa */
export function importoPedaggio(p: { importo: string }): number {
  const n = Number(p.importo);
  return Number.isFinite(n) ? n : 0;
}

/** Somma degli importi (IVA inclusa), arrotondata al centesimo */
export function totalePedaggi(righe: { importo: string }[]): number {
  return Math.round(righe.reduce((s, r) => s + importoPedaggio(r), 0) * 100) / 100;
}
