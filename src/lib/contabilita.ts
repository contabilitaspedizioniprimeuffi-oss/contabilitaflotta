// Le spese di carburante e manutenzione si contano da questa data in poi.
// - I rifornimenti più vecchi presenti nel Foglio Google non vengono più caricati.
// - Quelli già nel database (e le manutenzioni) sono stati tolti una volta sola all'avvio,
//   dopo averli copiati nelle tabelle archivio_rifornimenti e archivio_manutenzioni.
export const INIZIO_CONTABILITA = "2026-10-01";

// Prezzo del carburante (euro al litro) con cui si calcola la spesa dei rifornimenti.
// Ogni voce vale dalla sua data in poi: quando il prezzo cambia si aggiunge una voce con
// la data da cui vale, e i rifornimenti precedenti mantengono il prezzo di prima.
export const PREZZI_CARBURANTE: { dal: string; euroAlLitro: number }[] = [
  { dal: "2026-10-01", euroAlLitro: 2.0 },
];

/** Prezzo del carburante valido in una data (formato AAAA-MM-GG). */
export function prezzoCarburante(data: string): number {
  let prezzo = PREZZI_CARBURANTE[0].euroAlLitro;
  for (const voce of PREZZI_CARBURANTE) {
    if (data >= voce.dal) prezzo = voce.euroAlLitro;
  }
  return prezzo;
}
