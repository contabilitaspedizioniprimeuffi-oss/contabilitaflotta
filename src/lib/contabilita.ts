// Le spese di carburante e manutenzione si contano da questa data in poi.
// - I rifornimenti più vecchi presenti nel Foglio Google non vengono più caricati.
// - Quelli già nel database (e le manutenzioni) sono stati tolti una volta sola all'avvio,
//   dopo averli copiati nelle tabelle archivio_rifornimenti e archivio_manutenzioni.
export const INIZIO_CONTABILITA = "2026-10-01";
